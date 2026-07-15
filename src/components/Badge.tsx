import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { ReportTier } from '../types/vehicle';

const LABELS: Record<ReportTier, string> = {
  basic: 'BASIC',
  buyers_analysis: 'ANALYSIS',
  complete_history: 'FULL HISTORY',
};

export default function Badge({ tier }: { tier: ReportTier }) {
  const { colors, radius } = useTheme();
  const isPaid = tier !== 'basic';
  return (
    <View
      style={[
        styles.badge,
        {
          borderRadius: radius.sm,
          backgroundColor: isPaid ? colors.premium : colors.surfaceAlt,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: isPaid ? colors.onPrimary : colors.textMuted },
        ]}
      >
        {LABELS[tier] ?? 'REPORT'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});
