import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import PrimaryButton from '../components/PrimaryButton';
import { track } from '../config/analytics';
import {
  useConfirmPurchaseMutation,
  useStartPurchaseMutation,
} from '../services/api';
import { useAppDispatch } from '../store/hooks';
import { markPremium } from '../store/historySlice';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'PremiumUpsell'>;

const INCLUDED = [
  'Accident & collision history',
  'Title brands (salvage, flood, rebuilt)',
  'Theft & odometer checks',
  'Ownership & auction history',
  'AI Buy Score with plain-English advice',
];

const PRODUCT_ID = 'full_report';

/** Premium upsell + mock purchase (spec §12, §16). Real IAP arrives in a later phase. */
export default function PremiumUpsellScreen({ navigation, route }: Props) {
  const { colors, spacing, radius } = useTheme();
  const { vin } = route.params;
  const dispatch = useAppDispatch();
  const [startPurchase] = useStartPurchaseMutation();
  const [confirmPurchase, { isLoading }] = useConfirmPurchaseMutation();

  useEffect(() => {
    track('premium_cta_viewed', { vin });
  }, [vin]);

  const buy = async () => {
    track('premium_purchase_started', { vin });
    try {
      // TODO: replace with RevenueCat purchase flow; this mocks the store round-trip.
      const start = await startPurchase({ vin, productId: PRODUCT_ID }).unwrap();
      const confirm = await confirmPurchase({
        purchaseToken: start.purchaseToken,
        appStoreTransactionId: `mock-txn-${vin}`,
        platform: 'ios',
      }).unwrap();
      dispatch(markPremium({ vin, reportId: confirm.reportId }));
      track('premium_purchase_completed', { vin });
      navigation.replace('PremiumReport', { vin, reportId: confirm.reportId });
    } catch {
      track('premium_purchase_failed', { vin });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={[styles.title, { color: colors.text }]}>Unlock Complete History</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
          {INCLUDED.map((line) => (
            <View key={line} style={styles.row}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={[styles.rowText, { color: colors.text }]}>{line}</Text>
            </View>
          ))}
        </View>

        {/* Honest limits — don't promise data providers can't deliver (spec §12). */}
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
          Vehicle history data depends on available government, insurance, auction, and commercial
          records. No provider can guarantee every event is reported.
        </Text>

        <PrimaryButton label="Unlock Complete History — $4.99" loading={isLoading} onPress={buy} />
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
  disclaimer: { fontSize: 13, lineHeight: 19 },
});
