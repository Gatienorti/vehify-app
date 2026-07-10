import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import { Keyboard } from 'lucide-react-native';
import PrimaryButton from '../components/PrimaryButton';
import ManualEntrySheet from '../components/ManualEntrySheet';
import ScannerFrame from '../components/ScannerFrame';
import { track } from '../config/analytics';
import { useLookupPlateMutation, useLookupVinMutation } from '../services/api';
import { useRecordLookup } from '../hooks/useRecordLookup';
import type { TabScreenProps } from '../types/navigation';

type Props = TabScreenProps<'Scan'>;

// Dark "camera off" viewport — the live preview replaces this in Phase 4b.
const VIEWPORT_GRADIENT = ['#0B1220', '#17264F'] as const;

export default function ScanScreen({ navigation }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lookupVin, vinState] = useLookupVinMutation();
  const [lookupPlate, plateState] = useLookupPlateMutation();
  const recordLookup = useRecordLookup();
  const submitting = vinState.isLoading || plateState.isLoading;

  // Dark scanner screen → light status-bar icons while focused; restore on leave.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  const openManual = () => {
    track('manual_entry_opened');
    setSheetOpen(true);
  };

  const onSubmitVin = async (vin: string) => {
    try {
      const res = await lookupVin({ vin }).unwrap();
      recordLookup(res.vehicle, { lookupType: 'vin' });
      setSheetOpen(false);
      navigation.navigate('BasicResult', { vin: res.vehicle.vin });
    } catch {
      // TODO: surface a toast on failure
    }
  };

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

  return (
    <View style={styles.container}>
      <LinearGradient colors={VIEWPORT_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Live camera coming in Phase 4</Text>
          </View>
          <Text style={styles.title}>Scan a plate or VIN</Text>
          <Text style={styles.subtitle}>Point at a license plate — or a VIN barcode. We&apos;ll figure out which.</Text>
        </View>

        {/* Scanner target */}
        <View style={styles.stage}>
          <ScannerFrame />
          <Text style={styles.hint}>Hold steady — detection happens on your device</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <PrimaryButton label="Enter a plate or VIN" onPress={openManual} loading={submitting} />
          <Pressable onPress={openManual} style={styles.typeRow} hitSlop={8}>
            <Keyboard size={18} color="#AEB8CC" strokeWidth={2.25} />
            <Text style={styles.typeText}>Can&apos;t scan? Type instead</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ManualEntrySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSubmitVin={onSubmitVin}
        onSubmitPlate={onSubmitPlate}
        submitting={submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1220' },
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
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3DD68C' },
  statusText: { color: '#C7D0E0', fontSize: 12, fontWeight: '600' },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#9AA6BC', fontSize: 15, lineHeight: 21 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  hint: { color: '#8492AB', fontSize: 13, textAlign: 'center' },
  actions: { gap: 14, paddingBottom: 80 },
  typeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  typeText: { color: '#AEB8CC', fontSize: 15, fontWeight: '600' },
});
