import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleCheckBig } from 'lucide-react-native';
import { useTheme } from '../theme';
import VehicleCard from '../components/VehicleCard';
import PrimaryButton from '../components/PrimaryButton';
import BuyAnalysisSheet from '../components/BuyAnalysisSheet';
import { track } from '../config/analytics';
import { useGetVehicleBasicQuery } from '../services/api';
import { useAppSelector } from '../store/hooks';
import { usePurchaseReport } from '../hooks/usePurchaseReport';
import { PRICING, buyersAnalysisPrice, formatUsd } from '../config/pricing';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'BasicResult'>;

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.detailRow, { borderColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

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
  const [buySheetOpen, setBuySheetOpen] = useState(false);
  const { buy, buying } = usePurchaseReport();

  useEffect(() => {
    track('basic_report_viewed', { vin });
  }, [vin]);

  // Purchase runs right here (sheet stays up with the building overlay);
  // success rebuilds the stack as Tabs → Report so back lands on Scan.
  const buyAnalysis = async (mileage: number | undefined, askingPrice: number | undefined) => {
    try {
      const confirm = await buy(vin, 'buyers_analysis', { mileage, askingPrice, hasPlateCredit });
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          { name: 'PremiumReport', params: { vin, reportId: confirm.reportId, tier: confirm.tier } },
        ],
      });
    } catch {
      Alert.alert(
        'Purchase didn’t complete',
        'You haven’t been charged. Check your connection and try again.',
        [
          { text: 'Try again', onPress: () => void buyAnalysis(mileage, askingPrice) },
          { text: 'Not now', style: 'cancel' },
        ],
      );
    }
  };

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
        {/* Chips off — the full details table below covers the specs. */}
        <VehicleCard vehicle={data.vehicle} showSpecs={false} />

        {/* No summary line — the card title + spec table already say it all. */}

        {/* Specs the free decode verified — year/make/model/trim already live
            in the card title, so only NEW information appears here. */}
        <View style={[styles.detailsCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
          {(
            [
              ['Body style', data.vehicle.bodyStyle],
              ['Engine', data.vehicle.engine],
              ['Transmission', data.vehicle.transmission],
              ['Drive type', data.vehicle.driveType],
              ['Fuel type', data.vehicle.fuelType],
              ['Color', data.vehicle.color],
              ['Manufacturer', data.vehicle.manufacturer],
            ] satisfies [string, string | undefined][]
          )
            .filter((entry): entry is [string, string] => Boolean(entry[1]))
            .map(([label, value]) => (
              <DetailRow key={label} label={label} value={value} />
            ))}
        </View>

        {purchase ? (
          /* Report already purchased — never re-sell a non-consumable.
             replace (not navigate): back from the report should skip this
             screen and land on Scan. */
          <PrimaryButton
            label="View your report"
            onPress={() =>
              navigation.replace('PremiumReport', {
                vin,
                reportId: purchase.reportId,
                tier: purchase.tier,
              })
            }
          />
        ) : (
          /* Upsell to Buyer's Analysis — the funnel's money moment, sold as a
             proper offer card, not a gray paragraph. v2.1 honesty: Model Score
             + deal verdict; the per-VIN Buy Score is the Complete History
             promise, never implied here. */
          <View
            style={[
              styles.upsell,
              {
                backgroundColor: colors.surface,
                borderColor: colors.primary,
                borderRadius: radius.lg,
              },
            ]}
          >
            <Text style={[styles.upsellTitle, { color: colors.text }]}>
              Should you buy this car?
            </Text>
            {(
              [
                { label: 'Model Score — real complaints, recalls & federal investigations' },
                { label: 'Market value & suggested offer', starred: true },
                { label: 'A verdict on the asking price', starred: true },
                { label: 'Negotiation advice & maintenance outlook' },
              ] as { label: string; starred?: boolean }[]
            ).map((line) => (
              <View key={line.label} style={styles.featureRow}>
                <CircleCheckBig size={18} color={colors.success} strokeWidth={2.5} />
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {line.label}
                  {line.starred ? <Text style={{ color: colors.textMuted }}>*</Text> : null}
                </Text>
              </View>
            ))}
            <Text style={[styles.hedge, { color: colors.textMuted }]}>
              *When available for your vehicle — data coverage varies by age and model.
            </Text>
            {hasPlateCredit ? (
              <Text style={[styles.creditNote, { color: colors.success }]}>
                Your {formatUsd(PRICING.plateCredit)} plate credit is applied.
              </Text>
            ) : null}
            <PrimaryButton
              label={`Get Buyer Report — ${formatUsd(buyersAnalysisPrice(hasPlateCredit))}`}
              onPress={() => {
                track('premium_cta_viewed', { vin, tier: 'buyers_analysis' });
                setBuySheetOpen(true);
              }}
              style={{ marginTop: 6 }}
            />
          </View>
        )}
      </ScrollView>

      <BuyAnalysisSheet
        visible={buySheetOpen}
        price={buyersAnalysisPrice(hasPlateCredit)}
        submitting={buying}
        onCancel={() => !buying && setBuySheetOpen(false)}
        onBuy={(mileage, askingPrice) => void buyAnalysis(mileage, askingPrice)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  detailsCard: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  detailLabel: { fontSize: 15, flexShrink: 0 },
  detailValue: { fontSize: 15, fontWeight: '600', flex: 1, textAlign: 'right' },
  upsell: { padding: 16, borderWidth: 1.5, gap: 10 },
  upsellTitle: { fontSize: 18, fontWeight: '800' },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  featureText: { fontSize: 14.5, lineHeight: 20, flex: 1 },
  hedge: { fontSize: 12, fontWeight: '500' },
  creditNote: { fontSize: 13, fontWeight: '700' },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  errorBody: { fontSize: 14, marginTop: 6 },
});
