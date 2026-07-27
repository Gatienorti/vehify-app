import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { BuyScore } from '../types/vehicle';

/**
 * A 0–100 score card: the title sits INSIDE the card (top-left, with a band
 * dot), the score is small in the top-right, and the reasons ("why") fill the
 * card below (spec §13 — a score is never shown without its reason).
 */
export default function ScoreBadge({
  score,
  label = 'AI Buy Score',
}: {
  score: BuyScore;
  label?: string;
  /** Accepted for call-site compatibility; the per-VIN accent stripe was dropped. */
  premium?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const color =
    score.band === 'green'
      ? colors.scoreGreen
      : score.band === 'yellow'
        ? colors.scoreYellow
        : colors.scoreRed;
  const lines = score.reason.split('\n').filter((l) => l.trim() !== '');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderColor: colors.border },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        </View>
        <Text style={[styles.score, { color }]}>
          {score.score}
          <Text style={[styles.outOf, { color: colors.textMuted }]}>/100</Text>
        </Text>
      </View>
      {lines.length <= 1 ? (
        <Text style={[styles.reason, { color: colors.text }]}>{score.reason}</Text>
      ) : (
        lines.map((line) => (
          <Text key={line} style={[styles.reason, { color: colors.text }]}>
            {'•  '}
            {line}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: 17, fontWeight: '800', flexShrink: 1 },
  // Small, top-right — the number is the anchor, the reasons carry the weight.
  score: { fontSize: 22, fontWeight: '800' },
  outOf: { fontSize: 13, fontWeight: '600' },
  reason: { fontSize: 15, lineHeight: 21, marginTop: 8 },
});
