import React, { useCallback, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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
import type { TabScreenProps } from '../types/navigation';

type Props = TabScreenProps<'Scan'>;

// Dark backdrop shown when the camera isn't available/permitted.
const VIEWPORT_GRADIENT = ['#11203E', '#080D18'] as const;

// VIN barcodes are Code 39 / Code 128; some newer plates use Data Matrix / PDF417.
const VIN_BARCODES = ['code39', 'code128', 'datamatrix', 'pdf417', 'qr'] as const;

export default function ScanScreen({ navigation }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lookupVin, vinState] = useLookupVinMutation();
  const [lookupPlate, plateState] = useLookupPlateMutation();
  const recordLookup = useRecordLookup();
  const submitting = vinState.isLoading || plateState.isLoading;

  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const granted = permission?.granted ?? false;
  const cameraActive = isFocused && granted;
  const handledRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      handledRef.current = false;
      if (permission && !permission.granted && permission.canAskAgain) {
        track('camera_permission_requested');
        requestPermission().then((res) =>
          track(res.granted ? 'camera_permission_granted' : 'camera_permission_denied'),
        );
      }
      return () => setStatusBarStyle('dark');
    }, [permission, requestPermission]),
  );

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

  const onSubmitPlate = async (plate: string, state: string) => {
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
  };

  // VIN barcode path (needs no ML model — plate OCR arrives in 4b-2).
  const onBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (handledRef.current) return;
      const vin = extractVinFromBarcode(result.data ?? '');
      if (vin) {
        handledRef.current = true;
        track('vin_detected', { source: 'barcode' });
        track('scan_confirmed');
        void doVinLookup(vin);
      }
    },
    [doVinLookup],
  );

  const enableCamera = async () => {
    const res = await requestPermission();
    if (!res.granted) void Linking.openSettings();
  };

  const statusText = granted
    ? 'Scanning… point at a plate or VIN barcode'
    : 'Camera access needed to scan';

  return (
    <View style={styles.container}>
      {cameraActive ? (
        <>
          <CameraView
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
        <View style={styles.header}>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: granted ? '#3DD68C' : '#F5C518' }]} />
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
          <Text style={styles.title}>Scan a plate or VIN</Text>
          <Text style={styles.subtitle}>Point at a license plate — or a VIN barcode. We&apos;ll figure out which.</Text>
        </View>

        <View style={styles.stage}>
          <ScannerFrame />
          <Text style={styles.hint}>Hold steady — detection happens on your device</Text>
        </View>

        <View style={styles.actions}>
          {!granted ? <PrimaryButton label="Enable camera" onPress={enableCamera} /> : null}
          <PrimaryButton
            label="Enter a plate or VIN"
            variant={granted ? 'primary' : 'secondary'}
            onPress={openManual}
            loading={submitting}
          />
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
  header: { paddingTop: 8, gap: 8 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: '#C7D0E0', fontSize: 12, fontWeight: '600' },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#9AA6BC', fontSize: 15, lineHeight: 21 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  hint: { color: '#8492AB', fontSize: 13, textAlign: 'center' },
  actions: { gap: 12, paddingBottom: 80 },
  typeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  typeText: { color: '#AEB8CC', fontSize: 15, fontWeight: '600' },
});
