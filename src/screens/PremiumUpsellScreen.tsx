import React, { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleCheckBig } from 'lucide-react-native';
import { useTheme } from '../theme';
import PrimaryButton from '../components/PrimaryButton';
import { track } from '../config/analytics';
import {
  useConfirmPurchaseMutation,
  useStartPurchaseMutation,
} from '../services/api';
import { useAppDispatch } from '../store/hooks';
import { markPurchased } from '../store/historySlice';
import { recordPurchase } from '../store/purchasesSlice';
import {
  PRICING,
  PRODUCT_IDS,
  buyersAnalysisPrice,
  formatUsd,
} from '../config/pricing';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'PremiumUpsell'>;

const ANALYSIS_INCLUDED = [
  'AI Buy Score with plain-English advice',
  'Market value, MSRP & depreciation',
  'Suggested offer & negotiation advice',
  'Mileage history & rollback detection',
  'Maintenance outlook & factory equipment',
  'Open recalls, TSBs & complaint trends',
];

const HISTORY_INCLUDED = [
  'Everything in Buyer’s Analysis',
  'Accident & collision history',
  'Title brands (salvage, flood, rebuilt)',
  'Theft & odometer records',
  'Ownership & auction history, with photos',
  'Service history when available',
];

/** Premium upsell + mock purchase (spec §12, §16; Report Tiers v2). Real IAP arrives later. */
export default function PremiumUpsellScreen({ navigation, route }: Props) {
  const { colors, spacing, radius } = useTheme();
  const { vin, tier, hasPlateCredit = false } = route.params;
  const dispatch = useAppDispatch();
  const [startPurchase] = useStartPurchaseMutation();
  const [confirmPurchase, { isLoading }] = useConfirmPurchaseMutation();

  const isAnalysis = tier === 'buyers_analysis';
  const title = isAnalysis ? 'Buyer’s Analysis' : 'Complete Vehicle History';
  const included = isAnalysis ? ANALYSIS_INCLUDED : HISTORY_INCLUDED;
  // Analysis honors the plate credit; the history upgrade is a flat +$5.
  const price = isAnalysis ? buyersAnalysisPrice(hasPlateCredit) : PRICING.completeUpgrade;
  const buttonLabel = isAnalysis
    ? `Unlock ${title} — ${formatUsd(price)}`
    : `Add Complete History — +${formatUsd(price)}`;

  useEffect(() => {
    track('premium_cta_viewed', { vin, tier });
  }, [vin, tier]);

  const buy = async () => {
    track('premium_purchase_started', { vin, tier });
    if (isAnalysis && hasPlateCredit) track('plate_credit_applied', { vin });
    try {
      // TODO: replace with RevenueCat purchase flow; this mocks the store round-trip.
      const start = await startPurchase({ vin, tier, productId: PRODUCT_IDS[tier] }).unwrap();
      const confirm = await confirmPurchase({
        purchaseToken: start.purchaseToken,
        // Unique per purchase — the backend has a unique index on transaction
        // ids (double-mint guard), so re-buying a VIN must not collide.
        appStoreTransactionId: `mock-txn-${start.purchaseToken}`,
        platform: 'ios',
        tier,
      }).unwrap();
      // Trust the server's tier on the confirm — it is the billing record.
      const paidTier = confirm.tier;
      dispatch(markPurchased({ vin, tier: paidTier, reportId: confirm.reportId }));
      dispatch(
        recordPurchase({
          vin,
          tier: paidTier,
          reportId: confirm.reportId,
          productId: PRODUCT_IDS[tier],
          purchasedAt: new Date().toISOString(),
        }),
      );
      track('premium_purchase_completed', { vin, tier: paidTier });
      if (isAnalysis) {
        navigation.replace('PremiumReport', { vin, reportId: confirm.reportId, tier: paidTier });
      } else {
        // Upgrade: return to the report screen already on the stack with the
        // upgraded params — no stale analysis-only screen left behind.
        navigation.popTo('PremiumReport', { vin, reportId: confirm.reportId, tier: paidTier });
      }
    } catch {
      track('premium_purchase_failed', { vin, tier });
      Alert.alert(
        'Purchase didn’t complete',
        'You haven’t been charged. Check your connection and try again.',
        [
          { text: 'Try again', onPress: () => void buy() },
          { text: 'Not now', style: 'cancel' },
        ],
      );
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
          {included.map((line) => (
            <View key={line} style={styles.row}>
              <CircleCheckBig size={20} color={colors.success} strokeWidth={2.25} />
              <Text style={[styles.rowText, { color: colors.text }]}>{line}</Text>
            </View>
          ))}
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

        <PrimaryButton label={buttonLabel} loading={isLoading} onPress={buy} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontWeight: '800' },
  card: { borderWidth: 1, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { fontSize: 15, flex: 1 },
  credit: { fontSize: 14, fontWeight: '700' },
  disclaimer: { fontSize: 13, lineHeight: 19 },
});
