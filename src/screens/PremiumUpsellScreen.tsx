import React, { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleCheckBig } from 'lucide-react-native';
import { useTheme } from '../theme';
import PrimaryButton from '../components/PrimaryButton';
import LoadingOverlay from '../components/LoadingOverlay';
import { track } from '../config/analytics';
import { BUILDING_REPORT_MESSAGES } from '../config/loadingMessages';
import { PurchaseCancelledError, usePurchaseReport } from '../hooks/usePurchaseReport';
import { useCredits } from '../hooks/useCredits';
import { useCreditHeaderButton } from '../components/CreditBadge';
import { PRICING, creditCostFor, creditLabel, formatUsd } from '../config/pricing';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'PremiumUpsell'>;

// Honesty split (valuation move): the Buyer Report judges the MODEL —
// valuation (market value, suggested offer, negotiation) AND the per-VIN Buy
// Score are the Premium promise, never implied on the analysis tier.
// Hedge anything a provider may not cover (old/rare vehicles can no-hit on
// value; NHTSA only crash-tests some models) — never promise undeliverables.
// Starred lines share ONE small footnote under the list instead of inline
// hedges wrapping mid-line.
interface IncludedLine {
  label: string;
  starred?: boolean;
}

const AVAILABILITY_FOOTNOTE =
  '*When available for your vehicle — data coverage varies by age and model.';

const ANALYSIS_INCLUDED: IncludedLine[] = [
  { label: 'Model Score — complaints, recalls, TSBs & federal investigations' },
  { label: 'Crash ratings & fuel costs', starred: true },
  { label: 'Recent comparable listings', starred: true },
  { label: 'Maintenance outlook for this model' },
];

const HISTORY_INCLUDED: IncludedLine[] = [
  { label: 'Everything in the Buyer Report' },
  { label: 'Buy Score for this exact VIN' },
  { label: 'Market value & suggested offer', starred: true },
  { label: 'Negotiation advice', starred: true },
  { label: 'Accident & collision history', starred: true },
  { label: 'Title brands (salvage, flood, rebuilt)' },
  { label: 'Theft & odometer records' },
  { label: 'Ownership & service history' },
];

/** Premium upsell + mock purchase (spec §12, §16; Report Tiers v2). Real IAP arrives later. */
export default function PremiumUpsellScreen({ navigation, route }: Props) {
  const { colors, spacing, radius } = useTheme();
  useCreditHeaderButton();
  const { vin, tier } = route.params;
  const { buy, redeem, buying } = usePurchaseReport();

  const isAnalysis = tier === 'buyers_analysis';
  // complete_history is only ever reached here as an UPGRADE (the report
  // screen sends the user with the Buyer Report already owned) → discounted
  // credit cost. Credits-first: spend them when the balance covers it.
  const { balance } = useCredits();
  const creditCost = creditCostFor(tier, tier === 'complete_history');
  const useCredit = balance >= creditCost;
  const title = isAnalysis ? 'Buyer Report' : 'Premium Report';
  const included = isAnalysis ? ANALYSIS_INCLUDED : HISTORY_INCLUDED;
  const price = isAnalysis ? PRICING.buyersAnalysis : PRICING.completeUpgrade;
  const buttonLabel = useCredit
    ? `${creditLabel(creditCost)} — ${isAnalysis ? title : 'Premium Report'}`
    : isAnalysis
      ? `Unlock ${title} — ${formatUsd(price)}`
      : `Add Premium Report — +${formatUsd(price)}`;

  useEffect(() => {
    track('premium_cta_viewed', { vin, tier });
  }, [vin, tier]);

  // Tier-aware header replaces the static "Full report" AND the in-page h1 —
  // one title, not two.
  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const doBuy = async () => {
    try {
      const confirm = useCredit ? await redeem(vin, tier) : await buy(vin, tier);
      if (isAnalysis) {
        // Rebuild the stack as Tabs → Report: once the report is owned, the
        // basic page below is redundant — back should land on Scan.
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Tabs' },
            { name: 'PremiumReport', params: { vin, reportId: confirm.reportId, tier: confirm.tier } },
          ],
        });
      } else {
        // Upgrade: return to the report screen already on the stack with the
        // upgraded params — no stale analysis-only screen left behind.
        navigation.popTo('PremiumReport', { vin, reportId: confirm.reportId, tier: confirm.tier });
      }
    } catch (e) {
      if (e instanceof PurchaseCancelledError) return; // closed the sheet — silence
      Alert.alert(
        useCredit ? 'Couldn’t use your credit' : 'Purchase didn’t complete',
        useCredit
          ? 'Your credit wasn’t spent. Check your connection and try again.'
          : 'You haven’t been charged. Check your connection and try again.',
        [
          { text: 'Try again', onPress: () => void doBuy() },
          { text: 'Not now', style: 'cancel' },
        ],
      );
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {/* Compact reminder of what's included (the hard sell already
            happened on the basic page). */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
          {included.map((line) => (
            <View key={line.label} style={styles.row}>
              <CircleCheckBig size={20} color={colors.success} strokeWidth={2.25} />
              <Text style={[styles.rowText, { color: colors.text }]}>
                {line.label}
                {line.starred ? <Text style={{ color: colors.textMuted }}>*</Text> : null}
              </Text>
            </View>
          ))}
          {included.some((l) => l.starred) ? (
            <Text style={[styles.hedge, { color: colors.textMuted }]}>{AVAILABILITY_FOOTNOTE}</Text>
          ) : null}
        </View>

        {/* Honest limits — don't promise data providers can't deliver (spec §12). */}
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
          {isAnalysis
            ? 'Scores and outlooks are based on public records for this model — complaints, recalls, bulletins and crash tests. They are guidance, not an inspection.'
            : 'Vehicle history and market value depend on available government, insurance, auction, and commercial records. No provider can guarantee every event is reported.'}
        </Text>

        <PrimaryButton label={buttonLabel} loading={buying} onPress={() => void doBuy()} />
      </ScrollView>

      <LoadingOverlay
        visible={buying}
        title={isAnalysis ? 'Building your analysis…' : 'Adding the full history…'}
        messages={BUILDING_REPORT_MESSAGES}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontWeight: '800' },
  card: { borderWidth: 1, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { fontSize: 15, flex: 1 },
  hedge: { fontSize: 12, fontWeight: '500' },
  disclaimer: { fontSize: 13, lineHeight: 19 },
});
