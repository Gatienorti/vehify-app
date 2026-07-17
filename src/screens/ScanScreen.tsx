import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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
import {
  useGetPurchasesQuery,
  useLookupPlateMutation,
  useLookupVinMutation,
} from '../services/api';
import { useAppSelector } from '../store/hooks';
import { useRecordLookup } from '../hooks/useRecordLookup';
import { extractVinFromBarcode } from '../utils/vin';
import { discardShot, readPlateOnce } from '../ml/plateProcessor';
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
  // True from lookup-success until this screen blurs: the confirm sheet's
  // loading overlay stays up THROUGH the push transition (closing it first
  // flashes the bare scanner for a beat before the next screen lands).
  const [navigating, setNavigating] = useState(false);

  const readingRef = useRef(false);
  const camRef = useRef<CameraView>(null);
  const frameContainerRef = useRef<View>(null);
  const previewRef = useRef<View>(null);
  const frameMeasureRef = useRef<FrameLayout | null>(null);

  // Rolling buffer of plate reads from fresh photos, voted once enough agree.
  const plateReadsRef = useRef<string[]>([]);
  // Latest tick's frame shot; on detection it's promoted to the freeze-frame
  // shown over the scanner (spec §6: "freeze frame, show detected text").
  const lastShotRef = useRef<string | null>(null);
  const [frozenShot, setFrozenShot] = useState<string | null>(null);
  // Full-preview freeze for barcode hits (no frame crop exists for those).
  const [frozenFull, setFrozenFullState] = useState<string | null>(null);
  const setFrozenFull = (uri: string | null) => {
    setFrozenFullState((prev) => {
      if (prev && prev !== uri) discardShot(prev);
      return uri;
    });
  };
  const keepShot = (uri: string | null) => {
    if (lastShotRef.current && lastShotRef.current !== uri) discardShot(lastShotRef.current);
    lastShotRef.current = uri;
  };
  const freezeShot = () => {
    setFrozenShot((prev) => {
      if (prev) discardShot(prev);
      const shot = lastShotRef.current;
      lastShotRef.current = null;
      return shot;
    });
  };
  // Stable (setState + refs only) so callbacks can depend on it without churn.
  const unfreezeShot = useCallback(() => {
    setFrozenShot((prev) => {
      if (prev) discardShot(prev);
      return null;
    });
    setFrozenFullState((prev) => {
      if (prev) discardShot(prev);
      return null;
    });
  }, []);
  const frozen = frozenShot !== null || frozenFull !== null;
  const stateVotesRef = useRef<Map<string, number>>(new Map());
  // Last time a VIN-less barcode decoded. Streams of those mean the camera is
  // on a DOCUMENT (stickers/registrations are covered in barcodes; license
  // plates never are) — plate proposals from document text ("M0T0R",
  // "2008BMW") are suppressed while that signal is fresh.
  const docBarcodeAtRef = useRef(0);
  const clearReads = () => { plateReadsRef.current = []; stateVotesRef.current.clear(); };

  // Pinch-to-zoom for the camera (0 = none … 1 = max). Helps read a distant plate.
  const [zoom, setZoom] = useState(0);
  // Torch (continuous light) for low-light plates.
  const [torch, setTorch] = useState(false);

  const [lookupVin, vinState] = useLookupVinMutation();
  const [lookupPlate, plateState] = useLookupPlateMutation();
  // Auth state drives the quota-hit copy: anonymous users get the sign-in
  // upsell (3× the plate-lookup allowance), signed-in users get the timer.
  const signedIn = useAppSelector((s) => !!s.auth.token);
  const recordLookup = useRecordLookup();
  // Owned reports, readable inside stable callbacks without re-creating them.
  // Owned reports from the SERVER (source of truth) — never the local cache,
  // which can point at a report the backend no longer has.
  const { data: purchases } = useGetPurchasesQuery();
  const purchasesRef = useRef(purchases);
  useEffect(() => {
    purchasesRef.current = purchases;
  }, [purchases]);
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
        setNavigating(false);
        unfreezeShot();
        setTorch(false);
        setZoom(0);
      };
    }, [setScanning, setPendingPlate, setPendingVin, setTorch, setZoom, unfreezeShot]),
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
    keepShot(null);
    unfreezeShot();
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
  // Plate reads accumulate until 2 confident ticks agree, then the confirm
  // sheet opens. VINs are barcode/QR-only (onBarcodeScanned on the live
  // preview) — text-VIN OCR is retired: dense documents (registration cards)
  // produce checksum-lucky junk that no consensus rule reliably kills.
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
        keepShot(read.photoUri);

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
        const onDocument = Date.now() - docBarcodeAtRef.current < 2500;
        if (onDocument && vote && __DEV__) {
          console.log(`[ScanScreen] plate "${vote.plate}" suppressed — document barcodes streaming`);
        }
        if (vote && isAcceptableVote(vote, 2) && !handledRef.current && !onDocument) {
          handledRef.current = true;
          // Winning state = most-voted across reads.
          let state: string | null = null;
          let top = 0;
          for (const [code, count] of stateVotesRef.current) {
            if (count > top) { state = code; top = count; }
          }
          track('plate_detected', { state: state ?? 'unknown', confidence: vote.confidence });
          freezeShot();
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
    unfreezeShot();
    clearReads();
    handledRef.current = false;
  };

  const doVinLookup = useCallback(
    async (vin: string) => {
      setLookupError(null);
      try {
        const res = await lookupVin({ vin }).unwrap();
        recordLookup(res.vehicle, { lookupType: 'vin' });
        // Sheet + loading overlay stay up through the push (blur cleanup
        // clears them once the next screen has landed).
        setNavigating(true);
        setSheetOpen(false);
        // Already-owned report → straight to it; the basic page would only
        // offer "View your report" anyway.
        const owned = purchasesRef.current?.find((p) => p.vin === res.vehicle.vin && p.reportId);
        if (owned) {
          navigation.navigate('PremiumReport', {
            vin: res.vehicle.vin,
            reportId: owned.reportId,
            tier: owned.tier,
          });
        } else {
          navigation.navigate('BasicResult', { vin: res.vehicle.vin });
        }
      } catch {
        setLookupError("Couldn't reach the server. Check your connection and try again.");
      }
    },
    [lookupVin, recordLookup, navigation],
  );

  // FREE plate→VIN lookup (funnel opener — the paid reports carry the
  // economics). Cache-first server-side; a no-hit steers to free VIN entry.
  // Fires ONLY from the confirm sheet's explicit button, never from camera frames.
  const doPlateLookup = useCallback(
    async (plate: string, state: string) => {
      setLookupError(null);
      try {
        const res = await lookupPlate({ plate, state }).unwrap();
        setNavigating(true);
        setSheetOpen(false);
        track(res.source === 'cache' ? 'plate_cache_hit' : 'plate_cache_miss', { state });
        navigation.navigate('VehicleMatch', { result: res, plate, state });
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 404) {
          // No match on record — not an error, steer to the exact free path.
          setSheetOpen(false);
          setPendingPlate(null);
          unfreezeShot();
          Alert.alert(
            'No vehicle found for this plate',
            'We couldn’t match this plate. Plates can be transferred or data can be delayed. Enter the VIN instead — VIN lookups are exact.',
            [
              { text: 'Enter VIN', onPress: () => setSheetOpen(true) },
              { text: 'Back', style: 'cancel' },
            ],
          );
          return;
        }
        if (status === 429) {
          // Personal quota on LIVE resolves (cache hits never hit this).
          // Anonymous → the sign-in upsell (3× the allowance); signed-in →
          // it frees up within the hour (and any report purchase resets it).
          // VIN entry stays free and unlimited either way.
          setSheetOpen(false);
          setPendingPlate(null);
          unfreezeShot();
          track('plate_lookup_quota_hit', { signedIn });
          if (signedIn) {
            Alert.alert(
              'Plate lookup limit reached',
              'You’ve used your plate lookups for now — they free up within the hour. VIN lookups are free and unlimited, and any report purchase refills your plate lookups instantly.',
              [
                { text: 'Enter VIN — free', onPress: () => setSheetOpen(true) },
                { text: 'OK', style: 'cancel' },
              ],
            );
          } else {
            Alert.alert(
              'Free limit reached',
              'You’ve used the free plate lookups for now. Sign in to get 3× more, or look the vehicle up by VIN — that’s free and unlimited.',
              [
                { text: 'Sign in for more', onPress: () => navigation.navigate('Account') },
                { text: 'Enter VIN — free', onPress: () => setSheetOpen(true) },
                { text: 'Not now', style: 'cancel' },
              ],
            );
          }
          return;
        }
        setLookupError("The lookup didn't go through. Check your connection and try again.");
      }
    },
    [lookupPlate, navigation, signedIn, unfreezeShot],
  );

  // Manual plate entry → same editable confirm sheet
  const onSubmitPlate = (plate: string, state: string) => {
    handledRef.current = true;
    setSheetOpen(false);
    setPendingPlate({ plate, state });
  };

  // A barcode/QR is always a VIN — plates never carry them (covers Tesla's
  // door-jamb QR as well as Code39/128/DataMatrix/PDF417 VIN barcodes).
  // A barcode only counts when it sits INSIDE the scanner frame — same rule
  // the plate OCR already follows (it crops to the frame). Aim = intent, and
  // two barcodes in view (test sheets, cluttered documents) can't race.
  // Fails open when the platform gives no geometry.
  const barcodeInFrame = (result: BarcodeScanningResult): boolean => {
    const f = frameMeasureRef.current;
    if (!f) return true;
    const pts = result.cornerPoints?.length
      ? result.cornerPoints
      : result.bounds
        ? [{
            x: result.bounds.origin.x + result.bounds.size.width / 2,
            y: result.bounds.origin.y + result.bounds.size.height / 2,
          }]
        : null;
    if (!pts) return true;
    let cx = 0;
    let cy = 0;
    for (const pt of pts) { cx += pt.x; cy += pt.y; }
    cx /= pts.length;
    cy /= pts.length;
    // Some platforms report normalized [0..1] coordinates — scale to the view.
    if (cx <= 1 && cy <= 1) {
      cx *= f.previewWidth;
      cy *= f.previewHeight;
    }
    const PAD = 24; // forgiving edge — brackets are a guide, not a laser cut
    const left = f.pageX - f.previewX - PAD;
    const top = f.pageY - f.previewY - PAD;
    return cx >= left && cx <= left + f.width + PAD * 2 && cy >= top && cy <= top + f.height + PAD * 2;
  };

  const onBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (!scanning) return; // ignore until the user starts scanning
      if (handledRef.current) return;
      if (!barcodeInFrame(result)) {
        if (__DEV__) console.log(`[barcode] ${result.type} outside frame — ignored`);
        return;
      }
      const vin = extractVinFromBarcode(result.data ?? '');
      if (__DEV__) {
        // Log EVERY decode — silence means the symbology never decoded at all
        // (blur/glare/too small), which needs different debugging than a
        // VIN-less payload (document barcodes carry control numbers).
        const payload = result.data ?? '';
        console.log(`[barcode] ${result.type} -> ${vin ?? 'no VIN'} | ${payload.length} chars | FULL payload:\n${JSON.stringify(payload)}`);
      }
      if (!vin) {
        docBarcodeAtRef.current = Date.now();
        return;
      }
      handledRef.current = true;
      track('vin_detected', { source: 'barcode' });
      // Freeze what the user is aiming at: barcodes decode off the live feed
      // (no photo exists), so snap one. The OCR loop usually has the camera
      // mid-photo when a barcode fires — retry briefly instead of skipping,
      // or the preview visibly keeps moving behind the sheet. Best-effort:
      // the prompt opens regardless.
      const snapFreeze = (attempt: number) => {
        if (attempt >= 4) return;
        if (readingRef.current || !camRef.current) {
          setTimeout(() => snapFreeze(attempt + 1), 300);
          return;
        }
        readingRef.current = true;
        camRef.current
          .takePictureAsync({ skipProcessing: false, quality: 0.5 })
          .then((photo) => {
            if (photo?.uri) setFrozenFull(photo.uri);
          })
          .catch(() => {})
          .finally(() => {
            readingRef.current = false;
          });
      };
      snapFreeze(0);
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
          {frozenFull ? (
            <Image source={{ uri: frozenFull }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}
          {/* Darken the idle preview a touch so the frame + button pop —
              but never dim a frozen capture; it should read clean. */}
          {!frozen ? (
            <View style={[styles.scrim, !scanning && styles.scrimIdle]} pointerEvents="none" />
          ) : null}
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
            {frozenShot ? (
              <Image source={{ uri: frozenShot }} style={styles.frozenShot} resizeMode="cover" />
            ) : null}
            <ScannerFrame paused={frozen} />
          </View>
          {/* Always in layout (opacity toggle) — conditionally rendering it
              re-centers the stage and moves the frame between idle/scanning. */}
          <Text style={[styles.hint, !scanning && styles.hintHidden]}>
            Point at a license plate or VIN barcode
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
        onSubmitVin={(vin) => {
          // Claim the detection loop (like onSubmitPlate) so a camera tick
          // can't fire a competing read before the confirm sheet opens.
          handledRef.current = true;
          setPendingVin(vin);
          setSheetOpen(false);
        }}
        onSubmitPlate={onSubmitPlate}
        submitting={submitting || navigating}
      />

      <ScanConfirmSheet
        visible={pendingPlate !== null && pendingVin === null}
        initialPlate={pendingPlate?.plate ?? ''}
        initialState={pendingPlate?.state ?? null}
        submitting={submitting || navigating}
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
        submitting={submitting || navigating}
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
  // 20 (safe) + 36 = 56pt from the screen edge — narrower than the floating
  // tab bar so the scan controls read as a compact centered column.
  actions: { gap: 12, paddingBottom: 80, paddingHorizontal: 36 },
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
  // Detection freeze: the exact frame-region shot, shown inside the scanner
  // frame while a confirm sheet is up (slight inset so the corners stay visible).
  frozenShot: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 10 },
  torchBtnActive: {
    backgroundColor: '#FFD54A',
    borderColor: '#FFD54A',
  },
});
