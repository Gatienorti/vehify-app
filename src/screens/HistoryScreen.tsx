import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAppSelector } from '../store/hooks';
import Badge from '../components/Badge';
import { TAB_BAR_CLEARANCE } from '../components/FloatingTabBar';
import { track } from '../config/analytics';
import type { TabScreenProps } from '../types/navigation';
import type { HistoryEntry } from '../types/history';

type Props = TabScreenProps<'History'>;

function title(e: HistoryEntry): string {
  return [e.year, e.make, e.model, e.trim].filter(Boolean).join(' ') || e.vin;
}

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? 'Checked today' : `Checked ${d.toLocaleDateString()}`;
}

export default function HistoryScreen({ navigation }: Props) {
  const { colors, spacing } = useTheme();
  const entries = useAppSelector((s) => s.history.entries);

  useEffect(() => {
    track('history_viewed', { count: entries.length });
  }, [entries.length]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Text style={[styles.header, { color: colors.text, paddingHorizontal: spacing.lg }]}>History</Text>
      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No lookups yet</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            Tap SCAN to check your first vehicle. Your history is saved right here on this device.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE, gap: spacing.md }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                item.tier !== 'basic' && item.reportId
                  ? navigation.navigate('PremiumReport', {
                      vin: item.vin,
                      reportId: item.reportId,
                      tier: item.tier,
                    })
                  : navigation.navigate('BasicResult', { vin: item.vin })
              }
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Badge tier={item.tier} />
              <Text style={[styles.rowTitle, { color: colors.text }]}>{title(item)}</Text>
              <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                {when(item.lookedUpAt)}
                {item.plate ? `  ·  ${item.plate}${item.state ? ` (${item.state})` : ''}` : ''}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { fontSize: 32, fontWeight: '800', paddingTop: 8, paddingBottom: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyBody: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  row: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 },
  rowTitle: { fontSize: 17, fontWeight: '700' },
  rowMeta: { fontSize: 13 },
});
