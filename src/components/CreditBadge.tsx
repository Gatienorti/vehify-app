import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useCredits } from '../hooks/useCredits';

/**
 * Header chip on the purchase screens showing the report-credit balance.
 * Rendered ONLY once the user has ever held credits — invisible to the vast
 * majority who only ever use in-app purchase (keeps "Credits: 0" from being
 * confusing noise). A zero balance shows in red as a gentle "top up" cue.
 *
 * It only DISPLAYS balance — no link or steer to buy elsewhere (credits are
 * purchased on the website; App Store rules forbid pointing users there
 * from inside the app).
 */
export default function CreditBadge() {
  const { colors, radius } = useTheme();
  const { balance, everHeld } = useCredits();

  if (!everHeld) return null;

  return (
    <View style={[styles.chip, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radius.md }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>Credits: </Text>
      <Text style={[styles.value, { color: balance === 0 ? colors.danger : colors.text }]}>{balance}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  label: { fontSize: 13, fontWeight: '600' },
  value: { fontSize: 13, fontWeight: '800' },
});
