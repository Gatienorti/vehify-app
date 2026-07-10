import React, { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { Keyboard } from 'lucide-react-native';
import PrimaryButton from '../components/PrimaryButton';
import ManualEntrySheet from '../components/ManualEntrySheet';
import ScannerFrame from '../components/ScannerFrame';
import { track } from '../config/analytics';
import { useLookupPlateMutation, useLookupVinMutation } from '../services/api';
import { useRecordLookup } from '../hooks/useRecordLookup';
import { extractVinFromBarcode } from '../utils/vin';
import { plateReader } from '../ml/OnnxPlateReader';
import { capturePlate } from '../ml/capturePlate';
import type { TabScreenProps } from '../types/navigation';

type Props = TabScreenProps<'Scan'>;

const VIEWPORT_GRADIENT = ['#11203E', '#080D18'] as const;
const VIN_BARCODES = ['code39', 'code128', 'datamatrix', 'pdf417', 'qr'] as const;

export default function ScanScreen({ navigation }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [readingPlate, setReadingPlate] = useState(false);
  const camRef = useRef<CameraView>(null);
  const [lookupVin, vinState] = useLookupVinMutation();
  const [lookupPlate, plateState] = useLookupPlateMutation();
  const recordLookup = useRecordLookup();
  const submitting = vinState.isLoading || plateState.isLoading;

  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const cameraActive = isFocused && scanning && (permission?.granted ?? false);
  const handledRef = useRef(false);

  // Dark status bar icons; reset scan state when leaving the tab.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      handledRef.current = false;
      return () => {
        setStatusBarStyle('dark');
        setScanning(false);
      };
    }, []),
  );

  const startScanning = async () => {
    track('scan_button_tapped');
    let granted = permission?.granted ?? false;
    if (!granted) {
      track('camera_permission_requested');
      const res = await requestPermission();
      granted = res.granted;
      track(granted ? 'camera_permission_granted' : 'camera_permission_denied');
      if (!granted) {
        if (permission && !permission.canAskAgain) void Linking.openSettings();
        return;
      }
    }
    handledRef.current = false;
    setScanning(true);
    void plateReader.init(); // warm up the ONNX models
  };

  // Plate OCR: capture a frame, run plate_ocr + plate_state on-device, confirm.
  const onReadPlate = async () => {
    if (!camRef.current || readingPlate) return;
    setReadingPlate(true);
    try {
      const res = await capturePlate(camRef.current, plateReader);
      if (__DEV__) console.log('[plate read]', res);
      const plate = (res?.plate ?? '').replace(/\s/g, '');
      if (res && plate.length >= 4) {
        onSubmitPlate(plate, res.state);
      } else {
        Alert.alert('No plate detected', 'Line the plate up inside the frame and try again.');
      }
    } catch (e) {
      Alert.alert('Scan error', String(e));
    } finally {
      setReadingPlate(false);
    }
  };

  const openManual = () => {
    track('manual_entry_opened');
    setSheetOpen(true);
  };

  const doVinLookup = useCallback(
    async (vin: string) => {
      try {
        const res = await lookupVin({ vin }).unwrap();
        recordLookup(res.vehicle, { lookupType: 'vin' });
        setSheetOpen(false);
        navigation.navigate('BasicResult', { vin: res.vehicle.vin });
      } catch {
        handledRef.current = false;
      }
    },
    [lookupVin, recordLookup, navigation],
  );

  const doPlateLookup = useCallback(
    async (plate: string, state: string) => {
      track('plate_live_lookup_started', { state });
      try {
        const res = await lookupPlate({ plate, state }).unwrap();
        track(res.source === 'cache' ? 'plate_cache_hit' : 'plate_cache_miss', { state });
        track('plate_live_lookup_success', { state });
        setSheetOpen(false);
        navigation.navigate('VehicleMatch', { result: res, plate, state });
      } catch {
        track('plate_live_lookup_failed', { state });
      }
    },
    [lookupPlate, navigation],
  );

  // Plate lookups hit a paid database → confirm the $0.25 charge, or steer to VIN.
  const onSubmitPlate = (plate: string, state: string) => {
    Alert.alert(
      `Plate ${plate} · ${state}`,
      'A license-plate lookup costs $0.25 because it queries a paid plate database.\n\nScanning or entering the VIN is free — use that if you have it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue · $0.25', onPress: () => void doPlateLookup(plate, state) },
      ],
    );
  };

  // Confirm a scanned VIN before doing anything (barcode can misread).
  const onBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (handledRef.current) return;
      const vin = extractVinFromBarcode(result.data ?? '');
      if (!vin) return;
      handledRef.current = true;
      track('vin_detected', { source: 'barcode' });
      Alert.alert(
        'Is this the VIN?',
        `${vin}\n\nVIN lookups are free.`,
        [
          { text: 'Rescan', style: 'cancel', onPress: () => { handledRef.current = false; } },
          {
            text: 'Search',
            onPress: () => {
              track('scan_confirmed');
              void doVinLookup(vin);
            },
          },
        ],
      );
    },
    [doVinLookup],
  );

  return (
    <View style={styles.container}>
      {cameraActive ? (
        <>
          <CameraView
            ref={camRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...VIN_BARCODES] }}
            onBarcodeScanned={onBarcodeScanned}
          />
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
        {scanning ? (
          <View style={styles.topSpacer} />
        ) : (
          <View style={styles.header}>
            <Text style={styles.title}>Scan a plate or VIN</Text>
            <Text style={styles.subtitle}>Point at a license plate — or a VIN barcode.</Text>
          </View>
        )}

        <View style={styles.stage}>
          <ScannerFrame />
          {scanning ? <Text style={styles.hint}>Point at a plate or VIN barcode</Text> : null}
        </View>

        <View style={styles.actions}>
          {scanning ? (
            <PrimaryButton label="Read plate" onPress={onReadPlate} loading={readingPlate} />
          ) : (
            <PrimaryButton label="Start scanning" onPress={startScanning} />
          )}
          <Pressable onPress={openManual} style={styles.typeRow} hitSlop={8}>
            <Keyboard size={18} color="#AEB8CC" strokeWidth={2.25} />
            <Text style={styles.typeText}>Can&apos;t scan? Type instead</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ManualEntrySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSubmitVin={doVinLookup}
        onSubmitPlate={onSubmitPlate}
        submitting={submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1220' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,10,20,0.35)' },
  safe: { flex: 1, paddingHorizontal: 20 },
  topSpacer: { height: 8 },
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
  actions: { gap: 12, paddingBottom: 80 },
  typeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  typeText: { color: '#AEB8CC', fontSize: 15, fontWeight: '600' },
});
