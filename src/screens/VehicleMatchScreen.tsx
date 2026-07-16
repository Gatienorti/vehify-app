import React, { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import VehicleCard from '../components/VehicleCard';
import PrimaryButton from '../components/PrimaryButton';
import { track } from '../config/analytics';
import { useGetPurchasesQuery, useRefreshPlateMutation } from '../services/api';
import { useRecordLookup } from '../hooks/useRecordLookup';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'VehicleMatch'>;

/**
 * Refresh is only offered once the cached mapping is this old — younger rows
 * would be served cache-only by the backend anyway (its month gate), because
 * a live re-ask on a recently verified plate returns the same answer.
 */
const REFRESH_AFTER_DAYS = 30;

/** Confirmation screen after a plate lookup (spec §10). Always shown. */
export default function VehicleMatchScreen({ navigation, route }: Props) {
  const { colors, spacing } = useTheme();
  const { result, plate, state } = route.params;
  const [refreshPlate, { isLoading }] = useRefreshPlateMutation();
  const recordLookup = useRecordLookup();
  const fromCache = result.source === 'cache';
  const verifiedAtMs = result.lastVerifiedAt ? new Date(result.lastVerifiedAt).getTime() : NaN;
  const staleEnough = Number.isNaN(verifiedAtMs)
    ? true // unknown age — let the backend's gate decide
    : Date.now() - verifiedAtMs >= REFRESH_AFTER_DAYS * 86_400_000;
  const canRefresh = fromCache && staleEnough;
  // Already-owned report for this VIN → confirming the match goes straight to
  // the report; the basic page would only offer "View your report" anyway.
  // Ownership comes from the SERVER (source of truth) — never the local cache,
  // which can point at a report the backend no longer has and strand the user
  // on the report screen. No server report → we correctly show Basic.
  const { data: purchases } = useGetPurchasesQuery();
  const owned = purchases?.find((p) => p.vin === result.vehicle.vin && p.reportId);

  useEffect(() => {
    track('vehicle_match_viewed', { source: result.source });
  }, [result.source]);

  const confirm = () => {
    track('vehicle_confirmed');
    recordLookup(result.vehicle, {
      lookupType: 'plate',
      plate,
      state,
    });
    if (owned) {
      navigation.replace('PremiumReport', {
        vin: result.vehicle.vin,
        reportId: owned.reportId,
        tier: owned.tier,
      });
    } else {
      navigation.replace('BasicResult', { vin: result.vehicle.vin });
    }
  };

  // Rejected match → straight to manual VIN entry on the Scan tab, never a
  // silent bounce (the user may have just paid for the plate lookup).
  const goToVinEntry = () => {
    navigation.navigate('Tabs', { screen: 'Scan', params: { openVinEntry: true } });
  };

  // Rejection means different things by data age (spec §9, §10):
  // - stale cache (30+ days) → likely OUR data lags: one free live re-fetch.
  // - live or recently verified → the CURRENT record disagrees with the car
  //   in front of the user. That's a genuine caution sign (transferred plate,
  //   or the car isn't what it's presented as) — warn plainly but hedged
  //   (never "Danger" on unconfirmed data), then steer to the free VIN check.
  const reject = async () => {
    track('vehicle_rejected');
    if (!canRefresh) {
      Alert.alert(
        'Plate doesn’t match the car?',
        'A recent check of the state’s plate record points to the vehicle shown. If the car in front of you is different, the plate may have been transferred — or the car may not be what it’s presented as. Before going further, check the VIN printed at the base of the windshield or on the driver-door jamb. A VIN lookup is free and exact.',
        [
          { text: 'Enter VIN — free', onPress: goToVinEntry },
          { text: 'Back', style: 'cancel' },
        ],
      );
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
      // Don't silently teleport to the VIN sheet — say why first.
      Alert.alert(
        'Couldn’t refresh',
        'We couldn’t reach the records service just now. You can check the VIN directly — it’s free and exact.',
        [
          { text: 'Enter VIN — free', onPress: goToVinEntry },
          { text: 'Back', style: 'cancel' },
        ],
      );
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={[styles.title, { color: colors.text }]}>Is this the correct vehicle?</Text>
        <VehicleCard vehicle={result.vehicle} lastVerified={fromCache ? (result.lastVerifiedAt ?? undefined) : 'Today'} />

        {/* Calm, non-alarming wording per spec §9 — plates transfer, data can lag. */}
        <Text style={[styles.note, { color: colors.textMuted }]}>
          This plate result may not match the vehicle. Plates can be transferred or data can be delayed.
          For the most accurate result, enter the VIN.
        </Text>

        <PrimaryButton label="Yes, continue" onPress={confirm} />
        <PrimaryButton
          label={canRefresh ? 'No, refresh' : 'Not my car — enter VIN (free)'}
          variant="secondary"
          loading={isLoading}
          onPress={reject}
        />
        {canRefresh ? (
          <PrimaryButton label="Enter VIN instead" variant="ghost" onPress={goToVinEntry} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 24, fontWeight: '800' },
  note: { fontSize: 14, lineHeight: 20, marginVertical: 4 },
});
