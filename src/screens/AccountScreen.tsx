import React from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronRight,
  FileText,
  HelpCircle,
  Moon,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { addEntry, markPurchased } from '../store/historySlice';
import { setThemePreference } from '../store/settingsSlice';
import PrimaryButton from '../components/PrimaryButton';
import { TAB_BAR_CLEARANCE } from '../components/FloatingTabBar';
import { track } from '../config/analytics';
import type { TabScreenProps } from '../types/navigation';

type Props = TabScreenProps<'Account'>;

const PRIVACY_URL = 'https://vehify.app/privacy';
// Placeholder support channel until a real contact form/page exists.
const SUPPORT_EMAIL = 'gatien.orti@gmail.com';
// Hidden until real IAP (RevenueCat) ships — spec §16 requires it at launch.
const SHOW_RESTORE_PURCHASES = false as boolean;

function Row({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.row, { borderColor: colors.border }]}>
      <Icon size={21} color={colors.textMuted} strokeWidth={2.25} />
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <ChevronRight size={19} color={colors.textMuted} strokeWidth={2.25} style={{ marginLeft: 'auto' }} />
    </Pressable>
  );
}

export default function AccountScreen(_props: Props) {
  const { colors, spacing, isDark } = useTheme();
  const dispatch = useAppDispatch();

  // Device-local setting (AsyncStorage via the settings slice) — never synced
  // to the backend. The toggle reflects the effective theme (OS or override).
  const toggleDarkMode = (dark: boolean) => {
    dispatch(setThemePreference(dark ? 'dark' : 'light'));
    track('theme_changed', { mode: dark ? 'dark' : 'light' });
  };
  const entryCount = useAppSelector((s) => s.history.entries.length);
  const historyEntries = useAppSelector((s) => s.history.entries);
  const purchases = useAppSelector((s) => s.purchases.records);

  // Mock restore: re-link every purchase on this device back into history
  // (spec §16 — always support Restore Purchases). The RevenueCat phase swaps
  // the source from the local slice to store receipts; the flow shape stays.
  const restorePurchases = () => {
    track('restore_purchases_tapped');
    if (purchases.length === 0) {
      Alert.alert('Nothing to restore', 'No report purchases were found for this device.');
      return;
    }
    purchases.forEach((p) => {
      const existing = historyEntries.find((e) => e.vin === p.vin);
      if (existing) {
        dispatch(markPurchased({ vin: p.vin, tier: p.tier, reportId: p.reportId }));
      } else {
        // History was cleared — recreate a minimal entry so the report is
        // reachable again (title falls back to the VIN).
        dispatch(
          addEntry({
            id: `${p.vin}-restored-${p.purchasedAt}`,
            vin: p.vin,
            lookupType: 'vin',
            lookedUpAt: p.purchasedAt,
            tier: p.tier,
            reportId: p.reportId,
          }),
        );
      }
    });
    track('purchases_restored', { count: purchases.length });
    Alert.alert(
      'Purchases restored',
      `${purchases.length} report${purchases.length === 1 ? '' : 's'} restored to your History tab.`,
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE, gap: spacing.lg }}>
        <Text style={[styles.header, { color: colors.text }]}>Account</Text>

        {/* Optional account — only offered AFTER value is delivered (spec §15). */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Protect your reports</Text>
          <Text style={[styles.cardBody, { color: colors.textMuted }]}>
            Your {entryCount} lookup{entryCount === 1 ? '' : 's'} are saved only on this device. Create a
            free account to back them up and access reports anywhere.
          </Text>
          <PrimaryButton
            label="Continue with Apple"
            onPress={() => track('account_prompt_viewed', { source: 'account_tab' })}
            style={{ marginTop: spacing.md }}
          />
          <PrimaryButton
            label="Continue with Google"
            variant="secondary"
            onPress={() => track('account_prompt_viewed', { source: 'account_tab' })}
            style={{ marginTop: spacing.sm }}
          />
        </View>

        <View style={{ gap: 0 }}>
          <View style={[styles.row, { borderColor: colors.border }]}>
            <Moon size={21} color={colors.textMuted} strokeWidth={2.25} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Dark mode</Text>
            <Switch
              value={isDark}
              onValueChange={toggleDarkMode}
              thumbColor={colors.primary}
              trackColor={{ false: colors.surfaceAlt, true: colors.surfaceAlt }}
              ios_backgroundColor={colors.surfaceAlt}
              style={{ marginLeft: 'auto' }}
            />
          </View>
          {SHOW_RESTORE_PURCHASES ? (
            <Row icon={RefreshCw} label="Restore purchases" onPress={restorePurchases} />
          ) : null}
          <Row
            icon={HelpCircle}
            label="Support"
            onPress={() => {
              Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Vehify support`).catch(() =>
                Alert.alert('Support', `Email us at ${SUPPORT_EMAIL}`),
              );
            }}
          />
          <Row
            icon={FileText}
            label="Legal & privacy"
            onPress={() => {
              Linking.openURL(PRIVACY_URL).catch(() => {});
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { fontSize: 32, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  cardBody: { fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1 },
  rowLabel: { fontSize: 16 },
});
