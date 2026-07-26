import React, { useLayoutEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme';
import { useCredits } from '../hooks/useCredits';

/**
 * Chip showing the report-credit balance. Shown ONLY when the user actually
 * holds credits — a zero (or not-yet-loaded) balance renders nothing, so a user
 * who never bought credits never sees a "Credits: 0" chip anywhere.
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

  // Nothing to show until the user holds at least one credit.
  if (!balance) return null;

  const overlay = variant === 'overlay';
  const header = variant === 'header';
  const bg = overlay ? 'rgba(0,0,0,0.5)' : header ? 'transparent' : colors.surfaceAlt;
  const labelColor = overlay ? 'rgba(255,255,255,0.75)' : colors.textMuted;
  const valueColor = overlay ? '#FFFFFF' : colors.text;

  return (
    <View style={[styles.chip, { backgroundColor: bg }, header && styles.chipHeader, style]}>
      <Text style={[styles.label, { color: labelColor }]}>Credits: </Text>
      <Text style={[styles.value, { color: valueColor }]}>{balance}</Text>
    </View>
  );
}

/**
 * Sets the nav-bar credit chip as `headerRight` — but ONLY when the user holds
 * credits. Returning `null` from a headerRight function isn't enough on iOS 26:
 * react-native-screens still mounts an (empty) right-header subview and iOS
 * wraps it in its automatic glass pill, leaving a blank white round shape. So
 * at zero we make `headerRight` genuinely absent (`undefined`) — no subview, no
 * pill. Call this from any screen that wants the header chip.
 */
export function useCreditHeaderButton() {
  const navigation = useNavigation();
  const { balance } = useCredits();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: balance > 0 ? () => <CreditBadge variant="header" /> : undefined,
    });
  }, [navigation, balance]);
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
