import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { Keyboard, Zap, ZapOff } from 'lucide-react-native';
import PrimaryButton from '../components/PrimaryButton';
import ManualEntrySheet from '../components/ManualEntrySheet';
import ScanConfirmSheet from '../components/ScanConfirmSheet';
import VinConfirmSheet from '../components/VinConfirmSheet';
import ScannerFrame from '../components/ScannerFrame';
import { track } from '../config/analytics';
import { useLookupPlateMutation, useLookupVinMutation } from '../services/api';
import { useRecordLookup } from '../hooks/useRecordLookup';
import { extractVinFromBarcode } from '../utils/vin';
import { readPlateOnce } from '../ml/plateProcessor';
import { voteOnReads, isAcceptableVote } from '../ml/vote';
import type { FrameLayout } from '../ml/frameCrop';
import type { TabScreenProps } from '../types/navigation';

type Props = TabScreenProps<'Scan'>;

const VIEWPORT_GRADIENT = ['#11203E', '#080D18'] as const;
const VIN_BARCODES = ['code39', 'code128', 'datamatrix', 'pdf417', 'qr'] as const;

export default function ScanScreen({ navigation, route }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Pending confirmations (one or the other, never both)
  const [pendingPlate, setPendingPlate] = useState<{ plate: string; state: string | null } | null>(null);
  const [pendingVin, setPendingVin] = useState<string | null>(null);
  // Network/server failure of the lookup itself, surfaced inside the sheet.
  const [lookupError, setLookupError] = useState<string | null>(null);

  const readingRef = useRef(false);
  const camRef = useRef<CameraView>(null);
  const frameContainerRef = useRef<View>(null);
  const previewRef = useRef<View>(null);
  const frameMeasureRef = useRef<FrameLayout | null>(null);

  // Rolling buffer of plate reads from fresh photos, voted once enough agree.
  const plateReadsRef = useRef<string[]>([]);
  const stateVotesRef = useRef<Map<string, number>>(new Map());
  const clearReads = () => { plateReadsRef.current = []; stateVotesRef.current.clear(); };

  // Pinch-to-zoom for the camera (0 = none … 1 = max). Helps read a distant plate.
  const [zoom, setZoom] = useState(0);
  // Torch (continuous light) for low-light plates.
  const [torch, setTorch] = useState(false);

  const [lookupVin, vinState] = useLookupVinMutation();
  const [lookupPlate, plateState] = useLookupPlateMutation();
  const recordLookup = useRecordLookup();
  const submitting = vinState.isLoading || plateState.isLoading;
  const submittingRef = useRef(false);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  // Live viewfinder shows whenever we're on the tab with permission.
  const previewActive = isFocused && (permission?.granted ?? false);
  // The OCR loop only runs once the user has started scanning.
  const cameraActive = previewActive && scanning;
  const handledRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      handledRef.current = false;
      return () => {
        setStatusBarStyle('dark');
        setScanning(false);
        setPendingPlate(null);
        setPendingVin(null);
        setTorch(false);
        setZoom(0);
      };
    }, [setScanning, setPendingPlate, setPendingVin, setTorch, setZoom]),
  );

  // A rejected plate match steers here with the manual VIN sheet open
  // (ManualEntrySheet defaults to its VIN tab). Render-phase adjustment (per
  // React docs) + param cleared in an effect so re-visits don't re-open it.
  const wantsVinEntry = route.params?.openVinEntry === true;
  const [vinEntryConsumed, setVinEntryConsumed] = useState(false);
  if (wantsVinEntry && !vinEntryConsumed) {
    setVinEntryConsumed(true);
    setSheetOpen(true);
  }
  if (!wantsVinEntry && vinEntryConsumed) {
    setVinEntryConsumed(false);
  }
  useEffect(() => {
    if (wantsVinEntry) navigation.setParams({ openVinEntry: undefined });
  }, [wantsVinEntry, navigation]);

  // Ask for camera permission on arrival so the viewfinder is live immediately
  // (reaching this tab is the user tapping SCAN — the spec's permission trigger).
  useEffect(() => {
    if (isFocused && permission && !permission.granted && permission.canAskAgain) {
      track('camera_permission_requested');
      void requestPermission().then((res) => {
        track(res.granted ? 'camera_permission_granted' : 'camera_permission_denied');
      });
    }
  }, [isFocused, permission, requestPermission]);

  const startScanning = async () => {
    track('scan_button_tapped');
    let granted = permission?.granted ?? false;
    if (!granted) {
      const res = await requestPermission();
      granted = res.granted;
      if (!granted) {
        if (permission && !permission.canAskAgain) void Linking.openSettings();
        return;
      }
    }
    handledRef.current = false;
    setScanning(true);
  };

  const stopScanning = () => {
    setScanning(false);
    clearReads();
    setTorch(false);
    handledRef.current = false;
  };

  // Measure the ScannerFrame AND the camera preview box once the camera is
  // live — both are needed to map the frame to camera-image pixels.
  useEffect(() => {
    if (!previewActive) return;
    const timer = setTimeout(() => {
      previewRef.current?.measure((_px, _py, pw, ph, ppx, ppy) => {
        frameContainerRef.current?.measure((_fx, _fy, fw, fh, fpx, fpy) => {
          frameMeasureRef.current = {
            pageX: fpx, pageY: fpy, width: fw, height: fh,
            previewX: ppx, previewY: ppy, previewWidth: pw, previewHeight: ph,
          };
          console.log('[ScanScreen] frame measured:', JSON.stringify(frameMeasureRef.current));
        });
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [previewActive]);

  // Unified scan loop: every tick takes one fresh photo and auto-detects.
  // A valid 17-char VIN in the frame wins immediately (free lookup); otherwise
  // plate reads accumulate until 2 confident ticks agree, then the confirm
  // sheet opens. (VIN barcodes/QR never reach here — the live preview's
  // onBarcodeScanned handles those with no photo at all.)
  useEffect(() => {
    if (!cameraActive) return;
    clearReads();
    const id = setInterval(async () => {
      if (readingRef.current || submittingRef.current || handledRef.current) return;
      if (!camRef.current) return;
      readingRef.current = true;
      try {
        // Stop reading state (the extra wide crop) once one has 2+ votes —
        // keeps steady-state ticks plate-only and fast.
        let stateLocked = false;
        for (const count of stateVotesRef.current.values()) {
          if (count >= 2) { stateLocked = true; break; }
        }
        const read = await readPlateOnce(camRef.current, frameMeasureRef.current, { readState: !stateLocked });
        if (!read) return;

        if (read.vin && !handledRef.current) {
          handledRef.current = true;
          track('vin_detected', { source: 'ocr' });
          setPendingVin(read.vin);
          clearReads();
          return;
        }

        if (read.state) {
          stateVotesRef.current.set(read.state, (stateVotesRef.current.get(read.state) ?? 0) + 1);
        }
        // Each photo already yields a within-photo vote of ~9 reads; only trust
        // the confident ones, then confirm across just 2 ticks (guards against
        // a transient misread while the user pans across other plates).
        if (!read.confident || !read.plate) return;

        plateReadsRef.current.push(read.plate);
        if (plateReadsRef.current.length > 4) plateReadsRef.current.shift();

        const vote = voteOnReads(plateReadsRef.current);
        if (vote && isAcceptableVote(vote, 2) && !handledRef.current) {
          handledRef.current = true;
          // Winning state = most-voted across reads.
          let state: string | null = null;
          let top = 0;
          for (const [code, count] of stateVotesRef.current) {
            if (count > top) { state = code; top = count; }
          }
          track('plate_detected', { state: state ?? 'unknown', confidence: vote.confidence });
          setPendingPlate({ plate: vote.plate, state });
          clearReads();
        }
      } catch (e) {
        console.error('[ScanScreen] read error:', e);
      } finally {
        readingRef.current = false;
      }
    }, 500);
    return () => clearInterval(id);
  }, [cameraActive]);

  const resetPending = () => {
    setPendingPlate(null);
    setPendingVin(null);
    setLookupError(null);
    clearReads();
    handledRef.current = false;
  };

  const doVinLookup = useCallback(
    async (vin: string) => {
      setLookupError(null);
      try {
        const res = await lookupVin({ vin }).unwrap();
        recordLookup(res.vehicle, { lookupType: 'vin' });
        setSheetOpen(false);
        setPendingVin(null);
        navigation.navigate('BasicResult', { vin: res.vehicle.vin });
      } catch {
        setLookupError("Couldn't reach the server. Check your connection and try again.");
      }
    },
    [lookupVin, recordLookup, navigation],
  );

  const doPlateLookup = useCallback(
    async (plate: string, state: string) => {
      track('plate_live_lookup_started', { state });
      setLookupError(null);
      try {
        const res = await lookupPlate({ plate, state }).unwrap();
        track(res.source === 'cache' ? 'plate_cache_hit' : 'plate_cache_miss', { state });
        track('plate_live_lookup_success', { state });
        setSheetOpen(false);
        setPendingPlate(null);
        navigation.navigate('VehicleMatch', { result: res, plate, state });
      } catch {
        track('plate_live_lookup_failed', { state });
        setLookupError("The lookup didn't go through — you weren't charged. Check your connection and try again.");
      }
    },
    [lookupPlate, navigation],
  );

  // Manual plate entry → same editable confirm sheet
  const onSubmitPlate = (plate: string, state: string) => {
    handledRef.current = true;
    setSheetOpen(false);
    setPendingPlate({ plate, state });
  };

  // A barcode/QR is always a VIN — plates never carry them (covers Tesla's
  // door-jamb QR as well as Code39/128/DataMatrix/PDF417 VIN barcodes).
  const onBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (!scanning) return; // ignore until the user starts scanning
      if (handledRef.current) return;
      const vin = extractVinFromBarcode(result.data ?? '');
      if (!vin) return;
      handledRef.current = true;
      track('vin_detected', { source: 'barcode' });
      setPendingVin(vin);
    },
    [scanning],
  );

  // Pinch to zoom. `scaleChange` is the per-event ratio, so we accumulate it
  // onto the current zoom (functional update — no ref read during render). The
  // multiplier tunes sensitivity. Callbacks run on the JS thread (no reanimated).
  const pinch = Gesture.Pinch().onChange((e) => {
    setZoom((z) => Math.min(1, Math.max(0, z + (e.scaleChange - 1) * 0.9)));
  });

  return (
    <GestureDetector gesture={pinch}>
    <View style={styles.container} ref={previewRef} collapsable={false}>
      {previewActive ? (
        <>
          <CameraView
            ref={camRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            zoom={zoom}
            enableTorch={torch}
            // 1080p capture: skips the 12MP computational-photography pipeline
            // that made each takePictureAsync take ~2s. Plenty for OCR.
            pictureSize="1920x1080"
            animateShutter={false}
            // expo-camera focus semantics are inverted: "on" = focus ONCE then
            // LOCK; "off" = refocus automatically when needed (continuous). A
            // live scanner needs continuous AF as the plate distance changes.
            autofocus="off"
            barcodeScannerSettings={{ barcodeTypes: [...VIN_BARCODES] }}
            onBarcodeScanned={onBarcodeScanned}
          />
          {/* Darken the idle preview a touch so the frame + button pop. */}
          <View style={[styles.scrim, !scanning && styles.scrimIdle]} pointerEvents="none" />
        </>
      ) : (
        <LinearGradient
          colors={VIEWPORT_GRADIENT}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header keeps its layout space while scanning (opacity only) so the
            frame never shifts — the crop mapping is measured against this
            layout and must stay valid in both states. */}
        <View style={[styles.header, scanning && styles.headerHidden]} pointerEvents="none">
          <Text style={styles.title}>Scan a plate or VIN</Text>
          <Text style={styles.subtitle}>Point at a license plate — or a VIN label or barcode.</Text>
        </View>

        <View style={styles.stage}>
          <View ref={frameContainerRef} collapsable={false}>
            <ScannerFrame />
          </View>
          {/* Always in layout (opacity toggle) — conditionally rendering it
              re-centers the stage and moves the frame between idle/scanning. */}
          <Text style={[styles.hint, !scanning && styles.hintHidden]}>
            Point at a license plate or VIN
          </Text>
          {zoom > 0.01 ? (
            <Text style={styles.zoomBadge}>{`${(1 + zoom * 4).toFixed(1)}×`}</Text>
          ) : null}
        </View>

        {previewActive ? (
          <Pressable
            onPress={() => { setTorch((t) => !t); track('scan_torch_toggled', { on: !torch }); }}
            style={[styles.torchBtn, torch && styles.torchBtnActive]}
            hitSlop={10}
          >
            {torch ? <Zap size={22} color="#0B1220" strokeWidth={2.25} /> : <ZapOff size={22} color="#FFFFFF" strokeWidth={2.25} />}
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          {scanning ? (
            <Pressable onPress={stopScanning} style={styles.stopBtn} hitSlop={8}>
              <Text style={styles.stopBtnText}>Stop scanning</Text>
            </Pressable>
          ) : (
            <PrimaryButton label="Start scanning" onPress={startScanning} />
          )}
          <Pressable onPress={() => { track('manual_entry_opened'); setSheetOpen(true); }} style={styles.typeRow} hitSlop={8}>
            <Keyboard size={18} color="#AEB8CC" strokeWidth={2.25} />
            <Text style={styles.typeText}>Can&apos;t scan? Type instead</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ManualEntrySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSubmitVin={(vin) => { setPendingVin(vin); setSheetOpen(false); }}
        onSubmitPlate={onSubmitPlate}
        submitting={submitting}
      />

      <ScanConfirmSheet
        visible={pendingPlate !== null && pendingVin === null}
        initialPlate={pendingPlate?.plate ?? ''}
        initialState={pendingPlate?.state ?? null}
        submitting={submitting}
        serverError={lookupError}
        onCancel={resetPending}
        onConfirm={(plate, state) => {
          track('scan_confirmed');
          void doPlateLookup(plate, state);
        }}
      />

      <VinConfirmSheet
        visible={pendingVin !== null}
        initialVin={pendingVin ?? ''}
        submitting={submitting}
        serverError={lookupError}
        onCancel={resetPending}
        onConfirm={(vin) => {
          track('scan_confirmed');
          void doVinLookup(vin);
        }}
      />
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1220' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,10,20,0.35)' },
  scrimIdle: { backgroundColor: 'rgba(6,10,20,0.55)' },
  safe: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 8, gap: 8 },
  headerHidden: { opacity: 0 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#9AA6BC', fontSize: 15, lineHeight: 21 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  hint: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  hintHidden: { opacity: 0 },
  actions: { gap: 12, paddingBottom: 80 },
  typeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  typeText: { color: '#AEB8CC', fontSize: 15, fontWeight: '600' },
  // Mirrors PrimaryButton's metrics exactly (padding 12/16, radius 12, 16pt
  // text) so swapping Start↔Stop never shifts the layout — the ScannerFrame
  // must hold the same measured position in both states.
  stopBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5484D',
  },
  stopBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  // Floats above the stage flow — appearing/disappearing must not re-center
  // the frame.
  zoomBadge: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  torchBtn: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  torchBtnActive: {
    backgroundColor: '#FFD54A',
    borderColor: '#FFD54A',
  },
});
