import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

/** Any lucide icon OR a custom icon with the same size/color/stroke props. */
export type IconCmp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export type SpecEntry = {
  /** Optional — the Basic card gives each spec an icon; the dense report sheet omits them. */
  icon?: IconCmp;
  label: string;
  value: string;
  /** Full-width row (long values like a manufacturer name) instead of two-across. */
  wide?: boolean;
};

/**
 * One spec cell: optional icon, then label stacked over value. Stacking (not
 * label · value side-by-side) so a long value never squeezes the label into
 * "Horsepo…".
 */
function SpecCell({ icon: Icon, label, value }: SpecEntry) {
  const { colors } = useTheme();
  return (
    <View style={styles.cell}>
      {Icon ? <Icon size={18} color={colors.textMuted} strokeWidth={2} /> : null}
      <View style={styles.textCol}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

/**
 * Shared spec layout: short specs pair two-across (with a hairline divider),
 * long values get a full-width row. Renders rows only — the caller wraps it in
 * its own card/section. Used by the Basic check and the paid report so specs
 * read identically across the funnel.
 */
export default function SpecGrid({ entries }: { entries: SpecEntry[] }) {
  const { colors } = useTheme();
  const compact = entries.filter((e) => !e.wide);
  const wide = entries.filter((e) => e.wide);
  const pairs: SpecEntry[][] = [];
  for (let i = 0; i < compact.length; i += 2) pairs.push(compact.slice(i, i + 2));

  return (
    <>
      {pairs.map((pair, i) => (
        <View key={`p${i}`} style={[styles.row, { borderColor: colors.border }]}>
          <SpecCell {...pair[0]} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {pair[1] ? <SpecCell {...pair[1]} /> : <View style={styles.cell} />}
        </View>
      ))}
      {wide.map((e) => (
        <View key={e.label} style={[styles.row, { borderColor: colors.border }]}>
          <SpecCell {...e} />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  textCol: { flex: 1, gap: 1 },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: 10 },
  label: { fontSize: 12.5, fontWeight: '500' },
  value: { fontSize: 14.5, fontWeight: '700' },
});
