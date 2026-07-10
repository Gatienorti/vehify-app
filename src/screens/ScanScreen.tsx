import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';
import PrimaryButton from '../components/PrimaryButton';
import ManualEntrySheet from '../components/ManualEntrySheet';
import { brandGradient } from '../theme/colors';
import { track } from '../config/analytics';
import { useLookupPlateMutation, useLookupVinMutation } from '../services/api';
import { useRecordLookup } from '../hooks/useRecordLookup';
import type { TabScreenProps } from '../types/navigation';

type Props = TabScreenProps<'Scan'>;

export default function ScanScreen({ navigation }: Props) {
  const { colors, spacing, radius } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lookupVin, vinState] = useLookupVinMutation();
  const [lookupPlate, plateState] = useLookupPlateMutation();
  const recordLookup = useRecordLookup();

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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.content, { padding: spacing.lg }]}>
        <Text style={[styles.title, { color: colors.text }]}>Scan a plate or VIN</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Point your camera at a license plate or VIN to instantly know what car it is.
        </Text>

        {/* Camera viewport placeholder — live OCR arrives in Phase 4 (dev client + vision-camera). */}
        <View style={[styles.viewport, { borderColor: colors.border, borderRadius: radius.xl }]}>
          <LinearGradient
            colors={brandGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.viewportInner, { borderRadius: radius.xl }]}
          >
            <Ionicons name="scan-outline" size={72} color={colors.onPrimary} />
            <Text style={styles.viewportText}>Camera scanner (coming in Phase 4)</Text>
          </LinearGradient>
        </View>

        <PrimaryButton
          label="Enter a plate or VIN"
          onPress={openManual}
          loading={vinState.isLoading || plateState.isLoading}
          style={{ marginTop: spacing.lg }}
        />
        <Text style={[styles.helper, { color: colors.textMuted }]} onPress={openManual}>
          Can&apos;t scan? Type instead
        </Text>
      </View>

      <ManualEntrySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSubmitVin={onSubmitVin}
        onSubmitPlate={onSubmitPlate}
        submitting={vinState.isLoading || plateState.isLoading}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  viewport: { flex: 1, borderWidth: 1, marginTop: 24, overflow: 'hidden' },
  viewportInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  viewportText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', opacity: 0.9 },
  helper: { fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: 16 },
});
