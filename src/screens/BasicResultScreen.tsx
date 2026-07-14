import React, { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import VehicleCard from '../components/VehicleCard';
import PrimaryButton from '../components/PrimaryButton';
import { track } from '../config/analytics';
import { useGetVehicleBasicQuery } from '../services/api';
import { useAppSelector } from '../store/hooks';
import { PRICING, buyersAnalysisPrice, formatUsd } from '../config/pricing';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'BasicResult'>;

/** Free basic result (spec §11). */
export default function BasicResultScreen({ navigation, route }: Props) {
  const { colors, spacing, radius } = useTheme();
  const { vin } = route.params;
  const { data, isLoading, isError, refetch } = useGetVehicleBasicQuery(vin);
  const historyEntry = useAppSelector((s) => s.history.entries.find((e) => e.vin === vin));
  // Purchases are the durable ownership record (they survive a history clear).
  const purchase = useAppSelector((s) => s.purchases.records.find((r) => r.vin === vin));
  // The plate fee is credited toward Buyer's Analysis — earned when this
  // vehicle was reached via a (paid) plate lookup (Report Tiers v2, tier 2).
  const hasPlateCredit = historyEntry?.lookupType === 'plate';

  useEffect(() => {
    track('basic_report_viewed', { vin });
  }, [vin]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Couldn&apos;t load this vehicle</Text>
        <Text style={[styles.errorBody, { color: colors.textMuted }]}>
          Check your connection and try again.
        </Text>
        <PrimaryButton label="Try again" onPress={() => void refetch()} style={{ marginTop: 16, alignSelf: 'stretch', marginHorizontal: 24 }} />
      </SafeAreaView>
    );
  }

  if (isLoading || !data) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Vehicle Verified</Text>
        <VehicleCard vehicle={data.vehicle} />

        {data.summary ? (
          <Text style={[styles.summary, { color: colors.text }]}>{data.summary}</Text>
        ) : null}

        {purchase ? (
          /* Report already purchased — never re-sell a non-consumable. */
          <PrimaryButton
            label="View your report"
            onPress={() =>
              navigation.navigate('PremiumReport', {
                vin,
                reportId: purchase.reportId,
                tier: purchase.tier,
              })
            }
          />
        ) : (
          <>
            {/* Upsell to Buyer's Analysis — "should I buy this?" (Report Tiers
                v2, tier 3). Full history is a further upgrade from that report. */}
            <View style={[styles.upsell, { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg }]}>
              <Text style={[styles.upsellText, { color: colors.text }]}>
                Get the Buyer&apos;s Analysis for an AI Buy Score, market value, a suggested offer,
                and negotiation advice — so you know whether this is the right car at the right
                price.
              </Text>
              {hasPlateCredit ? (
                <Text style={[styles.creditNote, { color: colors.success }]}>
                  Your {formatUsd(PRICING.plateCredit)} plate credit is applied.
                </Text>
              ) : null}
            </View>
            <PrimaryButton
              label={`Get Buyer's Analysis — ${formatUsd(buyersAnalysisPrice(hasPlateCredit))}`}
              onPress={() =>
                navigation.navigate('PremiumUpsell', { vin, tier: 'buyers_analysis', hasPlateCredit })
              }
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  summary: { fontSize: 15, lineHeight: 22 },
  upsell: { padding: 16 },
  upsellText: { fontSize: 14, lineHeight: 20 },
  creditNote: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  errorBody: { fontSize: 14, marginTop: 6 },
});
