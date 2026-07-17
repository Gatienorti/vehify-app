import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import VehicleCard from '../components/VehicleCard';
import PrimaryButton from '../components/PrimaryButton';
import LoadingOverlay from '../components/LoadingOverlay';
import { PLATE_LOOKUP_MESSAGES } from '../config/loadingMessages';
import { track } from '../config/analytics';
import {
  useGetPurchasesQuery,
  useLookupPlateMutation,
  useRefreshPlateMutation,
} from '../services/api';
import { useAppSelector } from '../store/hooks';
import { useRecordLookup } from '../hooks/useRecordLookup';
import type { PlateLookupResponse } from '../types/api';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'VehicleMatch'>;

/**
 * Refresh is only offered once the cached mapping is this old — younger rows
 * would be served cache-only by the backend anyway (its month gate), because
 * a live re-ask on a recently verified plate returns the same answer.
 */
const REFRESH_AFTER_DAYS = 30;

/** Lookup outcomes that end somewhere other than a match. */
type PlateFailure = 'no_hit' | 'quota' | 'network';

/**
 * Confirmation screen after a plate lookup (spec §10). Always shown.
 *
 * Arrives in one of two ways: with a `result` already in hand (plate refresh
 * replaces the route), or with just `plate`/`state` — the scan flow navigates
 * here IMMEDIATELY on "Search plate — free" and THIS screen runs the lookup,
 * so the loading state lives where the user lands instead of collapsing a
 * sheet mid-transition.
 */
export default function VehicleMatchScreen({ navigation, route }: Props) {
  const { colors, spacing } = useTheme();
  const { plate, state } = route.params;
  const [lookupPlate] = useLookupPlateMutation();
  const [refreshPlate, { isLoading }] = useRefreshPlateMutation();
  const recordLookup = useRecordLookup();
  const [result, setResult] = useState<PlateLookupResponse | null>(route.params.result ?? null);
  const [failure, setFailure] = useState<PlateFailure | null>(null);
  // Auth state drives the quota-hit copy: anonymous users get the sign-in
  // upsell (3× the plate-lookup allowance), signed-in users get the timer.
  const signedIn = useAppSelector((s) => !!s.auth.token);
  // Screen-arrival time, captured once (render must stay pure — no Date.now()
  // mid-render). Staleness doesn't need to tick while the screen is open.
  const [nowMs] = useState(() => Date.now());
  // Already-owned report for this VIN → confirming the match goes straight to
  // the report; the basic page would only offer "View your report" anyway.
  // Ownership comes from the SERVER (source of truth) — never the local cache,
  // which can point at a report the backend no longer has and strand the user
  // on the report screen. No server report → we correctly show Basic.
  const { data: purchases } = useGetPurchasesQuery();

  const runLookup = useCallback(async () => {
    setFailure(null);
    try {
      const res = await lookupPlate({ plate, state }).unwrap();
      track(res.source === 'cache' ? 'plate_cache_hit' : 'plate_cache_miss', { state });
      setResult(res);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) {
        // No match on record — not an error, steer to the exact free path.
        setFailure('no_hit');
        return;
      }
      if (status === 429) {
        // Personal quota on LIVE resolves (cache hits never hit this).
        track('plate_lookup_quota_hit', { signedIn });
        setFailure('quota');
        return;
      }
      setFailure('network');
    }
  }, [lookupPlate, plate, state, signedIn]);

  // Fresh arrival from the scan flow — run the lookup exactly once.
  const startedRef = useRef(false);
  useEffect(() => {
    if (result || startedRef.current) return;
    startedRef.current = true;
    void runLookup();
  }, [result, runLookup]);

  const source = result?.source;
  useEffect(() => {
    if (source) track('vehicle_match_viewed', { source });
  }, [source]);

  // Rejected match / no-hit → straight to manual VIN entry on the Scan tab,
  // never a silent bounce.
  const goToVinEntry = () => {
    navigation.navigate('Tabs', { screen: 'Scan', params: { openVinEntry: true } });
  };

  if (failure) {
    const fail: { title: string; body: string } =
      failure === 'no_hit'
        ? {
            title: 'No vehicle found for this plate',
            body: `We couldn’t match ${plate} · ${state}. Plates can be transferred or data can be delayed. Enter the VIN instead — VIN lookups are exact.`,
          }
        : failure === 'quota'
          ? signedIn
            ? {
                title: 'Plate lookup limit reached',
                body: 'You’ve used your plate lookups for now — they free up within the hour. VIN lookups are free and unlimited, and any report purchase refills your plate lookups instantly.',
              }
            : {
                title: 'Free limit reached',
                body: 'You’ve used the free plate lookups for now. Sign in to get 3× more, or look the vehicle up by VIN — that’s free and unlimited.',
              }
          : {
              title: 'The lookup didn’t go through',
              body: 'We couldn’t reach the records service just now. Check your connection and try again.',
            };
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={[styles.failWrap, { padding: spacing.lg, gap: spacing.md }]}>
          <Text style={[styles.failTitle, { color: colors.text }]}>{fail.title}</Text>
          <Text style={[styles.failBody, { color: colors.textMuted }]}>{fail.body}</Text>
          {failure === 'network' ? (
            <PrimaryButton label="Try again" onPress={() => void runLookup()} />
          ) : null}
          {failure === 'quota' && !signedIn ? (
            <PrimaryButton
              label="Sign in for more"
              onPress={() => navigation.navigate('Tabs', { screen: 'Account' })}
            />
          ) : null}
          <PrimaryButton
            label="Enter VIN — free"
            variant={failure === 'no_hit' ? 'primary' : 'secondary'}
            onPress={goToVinEntry}
          />
          <PrimaryButton label="Back to scan" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  if (!result) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <LoadingOverlay visible title="Looking up this plate…" messages={PLATE_LOOKUP_MESSAGES} dim={false} />
      </SafeAreaView>
    );
  }

  const fromCache = result.source === 'cache';
  const verifiedAtMs = result.lastVerifiedAt ? new Date(result.lastVerifiedAt).getTime() : NaN;
  const staleEnough = Number.isNaN(verifiedAtMs)
    ? true // unknown age — let the backend's gate decide
    : nowMs - verifiedAtMs >= REFRESH_AFTER_DAYS * 86_400_000;
  const canRefresh = fromCache && staleEnough;
  const owned = purchases?.find((p) => p.vin === result.vehicle.vin && p.reportId);

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
      setResult(res);
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
  failWrap: { flex: 1, justifyContent: 'center' },
  failTitle: { fontSize: 22, fontWeight: '800' },
  failBody: { fontSize: 15, lineHeight: 21, marginBottom: 8 },
});
