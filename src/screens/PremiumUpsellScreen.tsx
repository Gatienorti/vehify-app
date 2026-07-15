import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleCheckBig } from 'lucide-react-native';
import { useTheme } from '../theme';
import PrimaryButton from '../components/PrimaryButton';
import LoadingOverlay from '../components/LoadingOverlay';
import { track } from '../config/analytics';
import { BUILDING_REPORT_MESSAGES } from '../config/loadingMessages';
import { usePurchaseReport } from '../hooks/usePurchaseReport';
import { PRICING, buyersAnalysisPrice, formatUsd } from '../config/pricing';
import { parseOptionalPositiveInt } from '../utils/number';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'PremiumUpsell'>;

// v2.1 honesty split: the analysis judges the MODEL and the PRICE — the
// per-VIN Buy Score is the Complete History promise, never implied here.
// Hedge anything a provider may not cover (old/rare vehicles can no-hit on
// value; NHTSA only crash-tests some models) — never promise undeliverables.
// Hedges render as small muted text after the label — visible honesty
// without stealing weight from the promise itself. Starred lines share ONE
// small footnote under the list instead of inline hedges wrapping mid-line.
interface IncludedLine {
  label: string;
  starred?: boolean;
}

const AVAILABILITY_FOOTNOTE =
  '*When available for your vehicle — data coverage varies by age and model.';

const ANALYSIS_INCLUDED: IncludedLine[] = [
  { label: 'Model Score — complaints, recalls, TSBs & federal investigations' },
  { label: 'Deal verdict on the asking price', starred: true },
  { label: 'Market value & suggested offer', starred: true },
  { label: 'Value vs. mileage & negotiation advice' },
  { label: 'Crash ratings & fuel costs', starred: true },
  { label: 'Maintenance outlook for this model' },
];

const HISTORY_INCLUDED: IncludedLine[] = [
  { label: 'Everything in the Buyer Report' },
  { label: 'Buy Score for this exact VIN' },
  { label: 'Accident & collision history', starred: true },
  { label: 'Title brands (salvage, flood, rebuilt)' },
  { label: 'Theft & odometer records' },
  { label: 'Ownership & service history' },
];

/** Premium upsell + mock purchase (spec §12, §16; Report Tiers v2). Real IAP arrives later. */
export default function PremiumUpsellScreen({ navigation, route }: Props) {
  const { colors, spacing, radius } = useTheme();
  const { vin, tier, hasPlateCredit = false } = route.params;
  const { buy, buying } = usePurchaseReport();

  const isAnalysis = tier === 'buyers_analysis';
  // Buyer-entered context (optional, analysis only) — they're standing at the
  // car. Powers the deal verdict and the mileage-personalized valuation.
  const [mileageText, setMileageText] = useState('');
  const [askingPriceText, setAskingPriceText] = useState('');
  const title = isAnalysis ? 'Buyer Report' : 'Premium Report';
  const included = isAnalysis ? ANALYSIS_INCLUDED : HISTORY_INCLUDED;
  // The Buyer Report honors the plate credit; the upgrade is a flat +$3.
  const price = isAnalysis ? buyersAnalysisPrice(hasPlateCredit) : PRICING.completeUpgrade;
  const buttonLabel = isAnalysis
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
      const confirm = await buy(vin, tier, {
        mileage: isAnalysis ? parseOptionalPositiveInt(mileageText) : undefined,
        askingPrice: isAnalysis ? parseOptionalPositiveInt(askingPriceText) : undefined,
        hasPlateCredit,
      });
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
    } catch {
      Alert.alert(
        'Purchase didn’t complete',
        'You haven’t been charged. Check your connection and try again.',
        [
          { text: 'Try again', onPress: () => void doBuy() },
          { text: 'Not now', style: 'cancel' },
        ],
      );
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        // Clear the native header + status bar so the focused input stays visible.
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Inputs FIRST — the previous screen already sold the features; this
            step is about acting. (Analysis tier only.) */}
        {isAnalysis ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
            <Text style={[styles.inputsTitle, { color: colors.text }]}>Standing at the car?</Text>
            <Text style={[styles.inputsHint, { color: colors.textMuted }]}>
              Add the odometer reading and asking price to get a deal verdict and a value
              personalized to this exact mileage. Both optional.
            </Text>
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Odometer (miles)</Text>
            <TextInput
              value={mileageText}
              onChangeText={setMileageText}
              placeholder="e.g. 78200"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={7}
              style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
            />
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Asking price ($)</Text>
            <TextInput
              value={askingPriceText}
              onChangeText={setAskingPriceText}
              placeholder="e.g. 18500"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={7}
              style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
            />
          </View>
        ) : null}

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

        {isAnalysis && hasPlateCredit ? (
          <Text style={[styles.credit, { color: colors.success }]}>
            {formatUsd(PRICING.plateCredit)} plate credit applied — you pay {formatUsd(price)} instead
            of {formatUsd(PRICING.buyersAnalysis)}.
          </Text>
        ) : null}

        {/* Honest limits — don't promise data providers can't deliver (spec §12). */}
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
          {isAnalysis
            ? 'Market value and analysis are estimates based on available data and comparable listings. They are guidance, not an appraisal.'
            : 'Vehicle history data depends on available government, insurance, auction, and commercial records. No provider can guarantee every event is reported.'}
        </Text>

        <PrimaryButton label={buttonLabel} loading={buying} onPress={() => void doBuy()} />
      </ScrollView>
      </KeyboardAvoidingView>

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
  credit: { fontSize: 14, fontWeight: '700' },
  disclaimer: { fontSize: 13, lineHeight: 19 },
  inputsTitle: { fontSize: 16, fontWeight: '700' },
  inputsHint: { fontSize: 13, lineHeight: 19 },
  inputLabel: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
