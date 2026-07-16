import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { BuyScore } from '../types/vehicle';

/** A 0–100 score card — always rendered WITH its reason (spec §13). */
export default function ScoreBadge({
  score,
  label = 'AI Buy Score',
  premium = false,
}: {
  score: BuyScore;
  label?: string;
  /** Per-VIN (Complete-History) score — brand accent, matching the history cards. */
  premium?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const color =
    score.band === 'green'
      ? colors.scoreGreen
      : score.band === 'yellow'
        ? colors.scoreYellow
        : colors.scoreRed;

  return (
    <>
      {/* Label OUTSIDE the card, styled like every other section header —
          the band dot carries the color at a glance. */}
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      </View>
      <View
        style={[
          styles.wrap,
          { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderColor: colors.border },
          premium && { borderLeftWidth: 3, borderLeftColor: colors.premium },
        ]}
      >
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
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1 },
  // Mirrors the report's section headers (18/800 + small gap above).
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: 18, fontWeight: '800' },
  score: { fontSize: 44, fontWeight: '800' },
  outOf: { fontSize: 18, fontWeight: '600' },
  reason: { fontSize: 15, lineHeight: 21, marginTop: 4 },
});
