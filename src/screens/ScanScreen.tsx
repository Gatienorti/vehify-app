import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import {
  CameraView,
  scanFromURLAsync,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { Keyboard, Zap, ZapOff } from 'lucide-react-native';
import PrimaryButton from '../components/PrimaryButton';
import { VCameraScan } from '../components/vehifyIcons';
import LoadingOverlay from '../components/LoadingOverlay';
import { SCANNING_MESSAGES, SCANNING_VIN_MESSAGES } from '../config/loadingMessages';
import ScannerFrame from '../components/ScannerFrame';
import CreditBadge from '../components/CreditBadge';
import { track } from '../config/analytics';
import { extractVinFromBarcode } from '../utils/vin';
import {
  capturePlatePhoto,
  cropToFrame,
  discardPreparedPlate,
  discardShot,
  preparePlatePhoto,
  readPreparedPlate,
  readVinFromImage,
  type CapturedPlatePhoto,
  type PreparedPlatePhoto,
  type SingleRead,
} from '../ml/plateProcessor';
import { voteOnReads } from '../ml/vote';
import { resolvePlateForState } from '../ml/plateFormat';
import type { FrameLayout } from '../ml/frameCrop';
import type { TabScreenProps } from '../types/navigation';

type Props = TabScreenProps<'Scan'>;

const VIEWPORT_GRADIENT = ['#11203E', '#080D18'] as const;
const VIN_BARCODES = ['code39', 'code128', 'datamatrix', 'pdf417', 'qr'] as const;
// Torch button hidden for now — flip to true to bring the flash toggle back.
const SHOW_TORCH = false as boolean;

type ScanMode = 'plate' | 'vin';

export default function ScanScreen({ navigation }: Props) {
  // Which target the shutter reads. Live barcode detection stays on in BOTH
  // modes, so a VIN barcode is never missed while on the Plate tab.
  const [mode, setMode] = useState<ScanMode>('plate');
  // A capture (burst) is in flight — shows the "Reading…" loader.
  const [capturing, setCapturing] = useState(false);

  const readingRef = useRef(false);
  // Synchronous lock: React state does not update until the next render, so it
  // cannot by itself stop two taps in the same frame from starting two photos.
  const captureInFlightRef = useRef(false);
  const permissionRequestedRef = useRef(false);
  const camRef = useRef<CameraView>(null);
  const frameContainerRef = useRef<View>(null);
  const previewRef = useRef<View>(null);
  const frameMeasureRef = useRef<FrameLayout | null>(null);

  // Reads accumulated during a capture burst; voted once the burst finishes.
  const plateReadsRef = useRef<string[]>([]);
  const stateVotesRef = useRef<Map<string, number>>(new Map());
  const clearReads = () => { plateReadsRef.current = []; stateVotesRef.current.clear(); };

  // Pinch-to-zoom for the camera (0 = none … 1 = max). Helps read a distant plate.
  const [zoom, setZoom] = useState(0);
  // Torch (continuous light) for low-light plates.
  const [torch, setTorch] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  // Live viewfinder shows whenever we're on the tab with permission. There's no
  // "start scanning" step anymore — you land ready, aim, and tap Capture.
  const previewActive = isFocused && (permission?.granted ?? false);
  // Reused as the "a capture/detection has claimed the flow" guard so a live
  // barcode can't race a shutter burst (or vice versa).
  const handledRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      // Ready to capture again on every return (e.g. back from ScanReview).
      handledRef.current = false;
      permissionRequestedRef.current = false;
      return () => {
        setStatusBarStyle('dark');
        setTorch(false);
        setZoom(0);
      };
    }, [setTorch, setZoom]),
  );

  // Ask for camera permission on arrival so the viewfinder is live immediately
  // (reaching this tab is the user tapping SCAN — the spec's permission trigger).
  useEffect(() => {
    if (
      isFocused &&
      permission &&
      !permission.granted &&
      permission.canAskAgain &&
      !permissionRequestedRef.current
    ) {
      permissionRequestedRef.current = true;
      track('camera_permission_requested');
      void requestPermission().then((res) => {
        track(res.granted ? 'camera_permission_granted' : 'camera_permission_denied');
      });
    }
  }, [isFocused, permission, requestPermission]);

  // Ensure camera permission before a capture; returns whether we may proceed.
  const ensurePermission = async (): Promise<boolean> => {
    if (permission?.granted) return true;
    track('camera_permission_requested');
    const res = await requestPermission();
    track(res.granted ? 'camera_permission_granted' : 'camera_permission_denied');
    return res.granted;
  };

  // Measure the ScannerFrame AND the camera preview box once the camera is
  // live — both are needed to map the frame to camera-image pixels. Re-runs on
  // mode change since the plate/VIN frames are different sizes.
  useEffect(() => {
    if (!previewActive) return;
    const timer = setTimeout(() => {
      previewRef.current?.measure((_px, _py, pw, ph, ppx, ppy) => {
        frameContainerRef.current?.measure((_fx, _fy, fw, fh, fpx, fpy) => {
          frameMeasureRef.current = {
            pageX: fpx, pageY: fpy, width: fw, height: fh,
            previewX: ppx, previewY: ppy, previewWidth: pw, previewHeight: ph,
          };
          if (__DEV__) {
            console.log('[ScanScreen] frame measured:', JSON.stringify(frameMeasureRef.current));
          }
        });
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [previewActive, mode]);

  // Shutter — PLATE mode. A burst of high-res reads, voted, always ending in the
  // (editable) confirm sheet — even on a weak/empty read, so a tap never feels
  // like "nothing happened." The burst keeps the multi-shot consensus that made
  // the old continuous loop accurate; the user just sees one tap.
  const PLATE_BURST = 4;
  const capturePlate = async () => {
    clearReads();
    const photos: CapturedPlatePhoto[] = [];
    const prepared: PreparedPlatePhoto[] = [];
    let shot: string | null = null;
    let shotPlateDetected = false;
    let previousRead: SingleRead | null = null;
    try {
      // Capture first, OCR second. This keeps all frames close together in
      // time instead of pausing for dozens of OCR passes between photos.
      readingRef.current = true;
      for (let i = 0; i < PLATE_BURST && !handledRef.current; i++) {
        if (!camRef.current) break;
        try {
          const photo = await capturePlatePhoto(camRef.current, true);
          if (photo) photos.push(photo);
        } catch (e) {
          if (__DEV__) console.error('[ScanScreen] plate photo error:', e);
        }
      }
      readingRef.current = false;

      // Run only the inexpensive crop + locate pass on every frame, then rank
      // before spending the multi-pass OCR budget.
      for (const photo of photos) {
        try {
          prepared.push(
            await preparePlatePhoto(photo, frameMeasureRef.current, { highRes: true }),
          );
        } catch (e) {
          if (__DEV__) console.error('[ScanScreen] plate prepare error:', e);
        }
      }
      prepared.sort((a, b) => b.qualityScore - a.qualityScore);

      for (let i = 0; i < prepared.length && !handledRef.current; i++) {
        let stateLocked = false;
        for (const count of stateVotesRef.current.values()) {
          if (count >= 2) { stateLocked = true; break; }
        }
        try {
          const read = await readPreparedPlate(prepared[i]!, {
            highRes: true,
            readState: !stateLocked,
          });
          if (!read) continue;
          if (read.state) {
            stateVotesRef.current.set(read.state, (stateVotesRef.current.get(read.state) ?? 0) + 1);
          }
          // Keep every non-empty per-photo proposal. A read that is too weak to
          // stand alone can still become trustworthy when separate photos agree.
          if (read.plate) plateReadsRef.current.push(read.plate);
          if (read.photoUri) {
            if (!shot) {
              shot = read.photoUri;
              shotPlateDetected = read.plateDetected;
            }
            else discardShot(read.photoUri);
          }
          // Stop only when two independent frames agree AND neither contains a
          // weak character. Device logs showed two matching GWU2019 reads with
          // min=55 that the remaining frames correctly outvoted as GHU2019.
          // Agreement alone is therefore not enough.
          let hasStateConsensus = false;
          for (const count of stateVotesRef.current.values()) {
            if (count >= 2) {
              hasStateConsensus = true;
              break;
            }
          }
          if (
            previousRead?.plate === read.plate &&
            previousRead.confident &&
            read.confident &&
            (previousRead.vote?.confidence ?? 0) >= 90 &&
            (read.vote?.confidence ?? 0) >= 90 &&
            (previousRead.vote?.minCharPct ?? 0) >= 75 &&
            (read.vote?.minCharPct ?? 0) >= 75 &&
            read.plate.length >= 6 &&
            hasStateConsensus
          ) {
            break;
          }
          previousRead = read;
        } catch (e) {
          if (__DEV__) console.error('[ScanScreen] plate OCR error:', e);
        }
      }
    } finally {
      readingRef.current = false;
      // Preparation deletes processed raws; deletion is idempotent, so this
      // also safely removes captures left after a prepare failure.
      for (const photo of photos) discardShot(photo.uri);
      for (const photo of prepared) discardPreparedPlate(photo);
    }

    const vote = voteOnReads(plateReadsRef.current, { preferDigitTwins: false });
    let state: string | null = null;
    let top = 0;
    for (const [code, count] of stateVotesRef.current) {
      if (count > top) { state = code; top = count; }
    }
    // A single state OCR hit is too easy to confuse with plate branding or a
    // slogan. Leave it blank so the required picker asks the user instead.
    if (top < 2) state = null;
    const resolvedPlate = vote?.plate
      ? resolvePlateForState(vote.plate, state, plateReadsRef.current)
      : '';
    // Confidence to show on the review page. A lone read is trivially "100%"
    // (it only agrees with itself) but isn't trustworthy — cap single reads to
    // the low band so the UI flags them honestly. No vote → nothing read.
    let confidence = resolvedPlate
      ? (plateReadsRef.current.length >= 2 ? vote!.confidence : Math.min(vote!.confidence, 45))
      : undefined;
    // Five-character plates exist, but in camera OCR they are also the common
    // signature of a clipped prefix/suffix (e.g. AC392 from 8BAC392). Keep the
    // editable proposal while forcing the review screen's low-confidence state.
    if (resolvedPlate.length === 5 && confidence !== undefined) {
      confidence = Math.min(confidence, 65);
    }
    handledRef.current = true;
    if (__DEV__) {
      console.log(
        `[capturePlate] result plate=${resolvedPlate || 'none'} state=${state ?? 'none'} ` +
          `confidence=${confidence ?? 'n/a'} candidateReads=${plateReadsRef.current.length}/${PLATE_BURST}`,
      );
    }
    track('plate_detected', { state: state ?? 'unknown', confidence: confidence ?? 0 });
    const imageUri = shot ?? undefined;
    clearReads();
    navigation.navigate('ScanReview', {
      mode: 'plate',
      plate: resolvedPlate,
      state,
      imageUri,
      plateDetected: shotPlateDetected,
      confidence,
    });
  };

  // Shutter — VIN mode. A high-res still scanned for a barcode via
  // scanFromURLAsync (can decode a small/blurry barcode the live feed missed).
  // Either way it lands on the review page (with the still, so the user can read
  // the VIN off it and type). Live passive barcode also stays on.
  // Barcode-scan a URI (VIN types), timeout-guarded. Returns the first VIN.
  const scanUriForVin = async (uri: string, tag: string): Promise<string | null> => {
    try {
      const found = await Promise.race([
        scanFromURLAsync(uri, [...VIN_BARCODES]),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('scan timeout')), 4000)),
      ]);
      if (__DEV__) {
        console.log(
          `[captureVin] ${tag}: ${found.length} barcode(s):`,
          found.map((r) => `${r.type}: ${JSON.stringify((r.data ?? '').slice(0, 40))}`).join(' | ') || '(none)',
        );
      }
      for (const r of found) {
        const v = extractVinFromBarcode(r.data ?? '');
        if (v) return v;
        if (__DEV__) console.log(`[captureVin] ${r.type} payload had no VIN: ${JSON.stringify(r.data ?? '')}`);
      }
    } catch (e) {
      if (__DEV__) console.log(`[captureVin] ${tag} failed:`, e);
    }
    return null;
  };

  const captureVin = async () => {
    let fullPhotoUri: string | null = null;
    let cropUri: string | null = null;
    let cropHandedToReview = false;
    try {
      if (!camRef.current) return;
      readingRef.current = true;
      const photo = await camRef.current.takePictureAsync({ skipProcessing: false, quality: 0.9 });
      fullPhotoUri = photo?.uri ?? null;
      readingRef.current = false;

      // Frame crop (also the display image) — the barcode is much larger here
      // than in the full still, so scan it FIRST (small codes decode better
      // upscaled). Fall back to the full still if the crop missed it.
      cropUri =
        photo?.uri && photo.width && photo.height
          ? await cropToFrame(photo.uri, photo.width, photo.height, frameMeasureRef.current)
          : null;

      let vin: string | null = null;
      let source: 'barcode' | 'text' = 'barcode';
      if (cropUri) vin = await scanUriForVin(cropUri, `frame-crop`);
      if (!vin && photo?.uri) vin = await scanUriForVin(photo.uri, `full-still ${photo.width}x${photo.height}`);
      // No VIN barcode → OCR the printed VIN text (check-digit validated). This
      // is what reads a registration doc / door-jamb label with no VIN barcode.
      if (!vin && cropUri) {
        vin = await readVinFromImage(cropUri);
        if (vin) source = 'text';
        if (__DEV__) console.log(`[captureVin] OCR text VIN: ${vin ?? 'none'}`);
      }
      if (__DEV__) console.log(`[captureVin] result vin=${vin ?? 'none'}`);

      handledRef.current = true;
      if (vin) track('vin_detected', { source: source === 'text' ? 'still' : 'barcode' });
      // Show the frame crop; drop the full still (never keep the whole picture).
      const imageUri = cropUri ?? undefined;
      navigation.navigate('ScanReview', {
        mode: 'vin',
        vin: vin ?? '',
        imageUri,
        // A decoded barcode is definitive. Checksum-valid text OCR is strong,
        // but still deserves an explicit double-check on the review screen.
        confidence: vin ? (source === 'barcode' ? 100 : 80) : undefined,
      });
      // ScanReview now owns this file and deletes it when that screen leaves.
      cropHandedToReview = cropUri !== null;
    } finally {
      readingRef.current = false;
      discardShot(fullPhotoUri);
      if (!cropHandedToReview) discardShot(cropUri);
    }
  };

  const captureOnce = async () => {
    if (captureInFlightRef.current || handledRef.current) return;
    captureInFlightRef.current = true;
    track('scan_button_tapped');
    try {
      if (!(await ensurePermission())) return;
      setCapturing(true);
      handledRef.current = false;
      // Tiny settle so continuous AF can lock — kept short; the preview has
      // usually been focused for a while before the tap.
      await new Promise((r) => setTimeout(r, 120));
      if (mode === 'plate') await capturePlate();
      else await captureVin();
    } finally {
      captureInFlightRef.current = false;
      setCapturing(false);
    }
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
      if (!previewActive) return; // only while the viewfinder is live
      // The still-capture path scans the same barcode itself. Ignoring live
      // callbacks during a shutter operation prevents two competing routes.
      if (captureInFlightRef.current) return;
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
      if (!vin) return; // VIN-less barcode (document control numbers) — ignore
      handledRef.current = true;
      track('vin_detected', { source: 'barcode' });
      // A decoded VIN barcode is trusted — straight to the review page to
      // confirm (no image needed; the barcode already resolved cleanly).
      navigation.navigate('ScanReview', { mode: 'vin', vin, confidence: 100 });
    },
    [previewActive, navigation],
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
            // that makes takePictureAsync take ~2s. The OCR normalizes to 1400px
            // anyway, so more capture pixels add latency with no read benefit.
            pictureSize="1920x1080"
            animateShutter={false}
            // expo-camera focus semantics are inverted: "on" = focus ONCE then
            // LOCK; "off" = refocus automatically when needed (continuous). A
            // live scanner needs continuous AF as the plate distance changes.
            autofocus="off"
            barcodeScannerSettings={{ barcodeTypes: [...VIN_BARCODES] }}
            onBarcodeScanned={onBarcodeScanned}
          />
          {/* Darken the preview a touch so the frame + controls pop. */}
          <View style={styles.scrim} pointerEvents="none" />
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
        <View style={styles.header} pointerEvents="none">
          <Text style={styles.title}>Scan a plate or VIN</Text>
          <Text style={styles.subtitle}>
            {mode === 'plate'
              ? 'Frame the license plate, then tap Capture.'
              : 'Frame the VIN barcode — door jamb, dashboard or windshield.'}
          </Text>
        </View>

        <View style={styles.stage}>
          <View ref={frameContainerRef} collapsable={false}>
            <ScannerFrame paused={capturing} variant={mode} />
          </View>
          <Text style={styles.hint}>
            {capturing
              ? 'Reading…'
              : mode === 'plate'
                ? 'Point at the license plate'
                : 'Point at the VIN barcode'}
          </Text>
          {zoom > 0.01 ? (
            <Text style={styles.zoomBadge}>{`${(1 + zoom * 4).toFixed(1)}×`}</Text>
          ) : null}
        </View>

        {/* Credit chip — top-right, always visible (0 shows in red). */}
        <View style={styles.topRight} pointerEvents="box-none">
          <CreditBadge variant="overlay" />
        </View>

        {/* Torch — bottom-right, within thumb reach just above the scan
            controls (out of the way of the top-right credit chip).
            Hidden for now (SHOW_TORCH) — flip back on when wanted. */}
        {SHOW_TORCH && previewActive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Turn off flashlight' : 'Turn on flashlight'}
            onPress={() => { setTorch((t) => !t); track('scan_torch_toggled', { on: !torch }); }}
            style={[styles.torchBtn, torch && styles.torchBtnActive]}
            hitSlop={10}
          >
            {torch ? <Zap size={22} color="#0B1220" strokeWidth={2.25} /> : <ZapOff size={22} color="#FFFFFF" strokeWidth={2.25} />}
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          {/* Plate / VIN mode tabs — default Plate. Live barcode stays on in
              both, so a VIN barcode is caught on either tab. */}
          <View style={styles.tabs}>
            {(['plate', 'vin'] as const).map((m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityLabel={m === 'plate' ? 'Scan a plate' : 'Scan a VIN'}
                accessibilityState={{ selected: mode === m }}
                onPress={() => { if (mode !== m) { setMode(m); track('scan_mode_changed', { mode: m }); } }}
                style={[styles.tab, mode === m && styles.tabActive]}
                hitSlop={6}
              >
                <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                  {m === 'plate' ? 'Plate' : 'VIN'}
                </Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton
            label={
              permission && !permission.granted
                ? permission.canAskAgain
                  ? 'Allow camera'
                  : 'Open camera settings'
                : capturing
                  ? 'Reading…'
                  : 'Capture'
            }
            onPress={
              permission && !permission.granted && !permission.canAskAgain
                ? () => void Linking.openSettings()
                : captureOnce
            }
            icon={VCameraScan}
            loading={capturing}
            disabled={capturing}
          />
          {permission && !permission.granted ? (
            <Text style={styles.permissionText}>
              {permission.canAskAgain
                ? 'Camera access is needed only for scanning. You can still type a plate or VIN.'
                : 'Camera access is off. Enable it in Settings, or type a plate or VIN instead.'}
            </Text>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Type plate or VIN manually" onPress={() => { track('manual_entry_opened'); navigation.navigate('ScanReview', { mode, manual: true }); }} style={styles.typeRow} hitSlop={8}>
            <Keyboard size={18} color="#AEB8CC" strokeWidth={2.25} />
            <Text style={styles.typeText}>Can&apos;t scan? Type instead</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Centered capture loader — same overlay pattern as lookups/reports,
          with scan-specific wording per mode. */}
      <LoadingOverlay
        visible={capturing}
        title={mode === 'plate' ? 'Reading the plate' : 'Reading the VIN'}
        messages={mode === 'plate' ? SCANNING_MESSAGES : SCANNING_VIN_MESSAGES}
      />

    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1220' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,10,20,0.4)' },
  safe: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 8, gap: 8 },
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
  // 20 (safe) + 36 = 56pt from the screen edge — narrower than the floating
  // tab bar so the scan controls read as a compact centered column.
  actions: { gap: 12, paddingBottom: 80, paddingHorizontal: 36 },
  // Plate / VIN segmented control above the shutter.
  tabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  tab: { paddingVertical: 7, paddingHorizontal: 22, borderRadius: 8 },
  tabActive: { backgroundColor: '#FFFFFF' },
  tabText: { color: '#DCE3F0', fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#0B1220' },
  typeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  typeText: { color: '#AEB8CC', fontSize: 15, fontWeight: '600' },
  permissionText: {
    color: '#AEB8CC',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
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
  // Credit chip, top-right corner — aligned to roughly the same height as the
  // title-row chip on History/Account.
  topRight: {
    position: 'absolute',
    top: 76,
    right: 20,
    alignItems: 'flex-end',
  },
  torchBtn: {
    // Bottom-right, just above the scan controls — thumb-reachable and clear
    // of the top-right credit chip.
    position: 'absolute',
    right: 24,
    bottom: 194,
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
  torchBtnActive: {
    backgroundColor: '#FFD54A',
    borderColor: '#FFD54A',
  },
});
