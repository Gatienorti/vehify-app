import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { useCredits } from '../hooks/useCredits';

/**
 * Chip showing the report-credit balance. ALWAYS visible — even at 0 for a
 * user who never held credits (owner decision 2026-07-20: the pill doubles as
 * awareness that credits exist at all). A zero balance shows in red as a
 * gentle "top up" cue.
 *
 * It only DISPLAYS balance — no link or steer to buy elsewhere (credits are
 * purchased on the website; App Store rules forbid pointing users there from
 * inside the app).
 *
 * Variants:
 * - `default` — gray pill for the light History/Account title rows.
 * - `header`  — transparent (text only) for the native nav bar. iOS 26 draws
 *   its own glass pill behind bar items, so ours must have NO background or it
 *   double-stacks ("pill behind the pill").
 * - `overlay` — dark translucent pill for the Scan camera view.
 */
export default function CreditBadge({
  variant = 'default',
  style,
}: {
  variant?: 'default' | 'header' | 'overlay';
  /** Extra layout style on the chip (e.g. alignSelf to right-align in a column). */
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { balance } = useCredits();

  const overlay = variant === 'overlay';
  const header = variant === 'header';
  const bg = overlay ? 'rgba(0,0,0,0.5)' : header ? 'transparent' : colors.surfaceAlt;
  const labelColor = overlay ? 'rgba(255,255,255,0.75)' : colors.textMuted;
  const zeroColor = overlay ? '#FF6369' : colors.danger;
  const valueColor = balance === 0 ? zeroColor : overlay ? '#FFFFFF' : colors.text;

  return (
    <View style={[styles.chip, { backgroundColor: bg }, header && styles.chipHeader, style]}>
      <Text style={[styles.label, { color: labelColor }]}>Credits: </Text>
      <Text style={[styles.value, { color: valueColor }]}>{balance}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  // iOS supplies the glass pill + padding in the nav bar; ours is text only.
  chipHeader: { paddingHorizontal: 0, paddingVertical: 0 },
  label: { fontSize: 13, fontWeight: '600' },
  value: { fontSize: 13, fontWeight: '800' },
});
