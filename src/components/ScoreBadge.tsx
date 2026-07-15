import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { BuyScore } from '../types/vehicle';

/** A 0–100 score card — always rendered WITH its reason (spec §13). */
export default function ScoreBadge({
  score,
  label = 'AI Buy Score',
}: {
  score: BuyScore;
  label?: string;
}) {
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
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      </View>
      <Text style={[styles.score, { color }]}>{score.score}<Text style={[styles.outOf, { color: colors.textMuted }]}>/100</Text></Text>
      {/* Multi-line reasons (one finding per line) render as a bullet list;
          a single-line reason stays plain prose. */}
      {(() => {
        const lines = score.reason.split('\n').filter((l) => l.trim() !== '');
        if (lines.length <= 1) {
          return <Text style={[styles.reason, { color: colors.text }]}>{score.reason}</Text>;
        }
        return lines.map((line) => (
          <Text key={line} style={[styles.reason, { color: colors.text }]}>
            {'•  '}
            {line}
          </Text>
        ));
      })()}
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
