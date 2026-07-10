import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronRight,
  FileText,
  HelpCircle,
  RefreshCw,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { useAppSelector } from '../store/hooks';
import PrimaryButton from '../components/PrimaryButton';
import { TAB_BAR_CLEARANCE } from '../components/FloatingTabBar';
import { track } from '../config/analytics';
import type { TabScreenProps } from '../types/navigation';

type Props = TabScreenProps<'Account'>;

function Row({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <Icon size={21} color={colors.textMuted} strokeWidth={2.25} />
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <ChevronRight size={19} color={colors.textMuted} strokeWidth={2.25} style={{ marginLeft: 'auto' }} />
    </View>
  );
}

export default function AccountScreen(_props: Props) {
  const { colors, spacing } = useTheme();
  const entryCount = useAppSelector((s) => s.history.entries.length);

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
          <Row icon={RefreshCw} label="Restore purchases" />
          <Row icon={Settings} label="Settings" />
          <Row icon={HelpCircle} label="Support" />
          <Row icon={FileText} label="Legal & privacy" />
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
