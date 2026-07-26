import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import PrimaryButton from '../components/PrimaryButton';
import LoadingOverlay from '../components/LoadingOverlay';
import { PLATE_LOOKUP_MESSAGES } from '../config/loadingMessages';
import { track } from '../config/analytics';
import { useLookupPlateMutation } from '../services/api';
import { useAppSelector } from '../store/hooks';
import { useRecordLookup } from '../hooks/useRecordLookup';
import type { PlateLookupResponse } from '../types/api';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'VehicleMatch'>;

/** Lookup outcomes that end somewhere other than a match. */
type PlateFailure = 'no_hit' | 'quota' | 'network';

/**
 * Plate lookup resolver. The user lands here immediately so the network wait
 * has a stable loading screen. A successful match now continues directly to
 * the Basic Check; that screen carries the plate context and owns the visible
 * "not the right car" recovery action before any paid-report CTA.
 */
export default function VehicleMatchScreen({ navigation, route }: Props) {
  const { colors, spacing } = useTheme();
  const { plate, state } = route.params;
  const [lookupPlate] = useLookupPlateMutation();
  const recordLookup = useRecordLookup();
  const [result, setResult] = useState<PlateLookupResponse | null>(route.params.result ?? null);
  const [failure, setFailure] = useState<PlateFailure | null>(null);
  // Auth state drives the quota-hit copy: anonymous users get the sign-in
  // upsell (3× the plate-lookup allowance), signed-in users get the timer.
  const signedIn = useAppSelector((s) => !!s.auth.token);

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

  // A successful plate lookup is useful immediately; asking for a separate
  // confirmation first added friction. Record it and open the free Basic Check.
  // The destination makes the plate source explicit and keeps rejection
  // available before the report purchase.
  const handedOffRef = useRef(false);
  useEffect(() => {
    if (!result || handedOffRef.current) return;
    handedOffRef.current = true;
    track('vehicle_match_viewed', { source: result.source });
    recordLookup(result.vehicle, { lookupType: 'plate', plate, state });
    navigation.replace('BasicResult', {
      vin: result.vehicle.vin,
      plateMatch: {
        plate,
        state,
        source: result.source,
        lastVerifiedAt: result.lastVerifiedAt,
      },
    });
  }, [navigation, plate, recordLookup, result, state]);

  // Rejected match / no-hit → straight to manual VIN entry, never a silent bounce.
  const goToVinEntry = () => {
    navigation.navigate('ScanReview', { mode: 'vin', manual: true });
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

  // The handoff effect runs immediately; retain a stable loading surface for
  // the single render before navigation commits.
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <LoadingOverlay visible title="Opening the Basic Check…" messages={PLATE_LOOKUP_MESSAGES} dim={false} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  failWrap: { flex: 1, justifyContent: 'center' },
  failTitle: { fontSize: 22, fontWeight: '800' },
  failBody: { fontSize: 15, lineHeight: 21, marginBottom: 8 },
});
