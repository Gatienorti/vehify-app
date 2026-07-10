import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { BuyScore } from '../types/vehicle';

/** AI Buy Score — always rendered WITH its reason (spec §13). */
export default function ScoreBadge({ score }: { score: BuyScore }) {
  const { colors, radius, spacing } = useTheme();
  const color =
    score.band === 'green'
      ? colors.scoreGreen
      : score.band === 'yellow'
        ? colors.scoreYellow
        : colors.scoreRed;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.label, { color: colors.textMuted }]}>AI Buy Score</Text>
      </View>
      <Text style={[styles.score, { color }]}>{score.score}<Text style={[styles.outOf, { color: colors.textMuted }]}>/100</Text></Text>
      <Text style={[styles.reason, { color: colors.text }]}>{score.reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: 13, fontWeight: '600' },
  score: { fontSize: 44, fontWeight: '800', marginTop: 4 },
  outOf: { fontSize: 18, fontWeight: '600' },
  reason: { fontSize: 15, lineHeight: 21, marginTop: 4 },
});
