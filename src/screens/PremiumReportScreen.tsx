import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import VehicleCard from '../components/VehicleCard';
import ScoreBadge from '../components/ScoreBadge';
import { useGetReportQuery } from '../services/api';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'PremiumReport'>;

function StatRow({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statRow, { borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: bad ? colors.danger : colors.text }]}>{value}</Text>
    </View>
  );
}

/** Purchased premium report (spec §12–13). */
export default function PremiumReportScreen({ route }: Props) {
  const { colors, spacing } = useTheme();
  const { vin, reportId } = route.params;
  const { data, isLoading } = useGetReportQuery(
    { id: reportId ?? `report-${vin}`, vin },
  );

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
        <VehicleCard vehicle={data.vehicle} />
        <ScoreBadge score={data.buyScore} />

        <View style={[styles.stats, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <StatRow label="Accidents reported" value={String(data.accidents)} bad={data.accidents > 0} />
          <StatRow label="Title brands" value={data.titleBrands.length ? data.titleBrands.join(', ') : 'None'} bad={data.titleBrands.length > 0} />
          <StatRow label="Theft records" value={String(data.thefts)} bad={data.thefts > 0} />
          <StatRow label="Odometer issues" value={String(data.odometerIssues)} bad={data.odometerIssues > 0} />
          <StatRow label="Owners" value={data.owners ? String(data.owners) : 'Unknown'} />
        </View>

        <Text style={[styles.reco, { color: colors.text }]}>{data.recommendation}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  stats: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  statLabel: { fontSize: 15 },
  statValue: { fontSize: 15, fontWeight: '700' },
  reco: { fontSize: 16, lineHeight: 23 },
});
