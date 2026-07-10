import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import VehicleCard from '../components/VehicleCard';
import PrimaryButton from '../components/PrimaryButton';
import { track } from '../config/analytics';
import { useRefreshPlateMutation } from '../services/api';
import { useRecordLookup } from '../hooks/useRecordLookup';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'VehicleMatch'>;

/** Confirmation screen after a plate lookup (spec §10). Always shown. */
export default function VehicleMatchScreen({ navigation, route }: Props) {
  const { colors, spacing } = useTheme();
  const { result, plate, state } = route.params;
  const [refreshPlate, { isLoading }] = useRefreshPlateMutation();
  const recordLookup = useRecordLookup();
  const fromCache = result.source === 'cache';

  useEffect(() => {
    track('vehicle_match_viewed', { source: result.source });
  }, [result.source]);

  const confirm = () => {
    track('vehicle_confirmed');
    recordLookup(result.vehicle, {
      lookupType: 'plate',
    });
    navigation.replace('BasicResult', { vin: result.vehicle.vin });
  };

  // "No, refresh" is free ONLY when the match came from cache (spec §9, §10).
  // From a live result we don't allow unlimited free refreshes — steer to VIN.
  const refresh = async () => {
    track('vehicle_rejected');
    if (!fromCache) {
      navigation.goBack();
      return;
    }
    try {
      const res = await refreshPlate({
        plate,
        state,
        reason: 'user_rejected_cached_match',
      }).unwrap();
      navigation.replace('VehicleMatch', { result: res, plate, state });
    } catch {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={[styles.title, { color: colors.text }]}>Is this the correct vehicle?</Text>
        <VehicleCard vehicle={result.vehicle} lastVerified={fromCache ? result.lastVerifiedAt : 'Today'} />

        {/* Calm, non-alarming wording per spec §9 — plates transfer, data can lag. */}
        <Text style={[styles.note, { color: colors.textMuted }]}>
          This plate result may not match the vehicle. Plates can be transferred or data can be delayed.
          For the most accurate result, enter the VIN.
        </Text>

        <PrimaryButton label="Yes, continue" onPress={confirm} />
        <PrimaryButton
          label={fromCache ? 'No, refresh' : 'No, this looks wrong'}
          variant="secondary"
          loading={isLoading}
          onPress={refresh}
        />
        <PrimaryButton
          label="Enter VIN instead"
          variant="ghost"
          onPress={() => navigation.goBack()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 24, fontWeight: '800' },
  note: { fontSize: 14, lineHeight: 20, marginVertical: 4 },
});
