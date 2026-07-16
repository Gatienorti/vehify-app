import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme';
import { useAppSelector } from '../store/hooks';
import { useGetHistoryQuery } from '../services/api';
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

/** Spinner shows at least this long on landing — one clean render, no flicker. */
const SETTLE_MIN_MS = 500;

export default function HistoryScreen({ navigation }: Props) {
  const { colors, spacing } = useTheme();
  // Server is the source of truth (keyed on account or device). Local history
  // is only an instant-paint cache: the fallback when the server is offline.
  const { data, refetch } = useGetHistoryQuery();
  const localEntries = useAppSelector((s) => s.history.entries);
  const entries = data ?? localEntries;

  // Settle gate — COLD landings only (no server feed cached yet): painting the
  // local cache first and swapping to the server's version a beat later reads
  // as a flicker of reordering/badge changes. Once the query cache is warm,
  // returns render instantly from it and the focus refetch updates silently.
  const [settled, setSettled] = useState(false);
  const gated = !settled && data === undefined;
  useFocusEffect(
    useCallback(() => {
      setSettled(false);
      const started = Date.now();
      let alive = true;
      void refetch().finally(() => {
        const wait = Math.max(0, SETTLE_MIN_MS - (Date.now() - started));
        setTimeout(() => {
          if (alive) setSettled(true);
        }, wait);
      });
      return () => {
        alive = false;
      };
    }, [refetch]),
  );

  useEffect(() => {
    track('history_viewed', { count: entries.length });
  }, [entries.length]);

  const showEmpty = entries.length === 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Text style={[styles.header, { color: colors.text, paddingHorizontal: spacing.lg }]}>History</Text>
      {gated ? (
        <View style={styles.empty}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : showEmpty ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No lookups yet</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            Tap SCAN to check your first vehicle. Your history syncs to your account when you sign in.
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
