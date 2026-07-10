import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme';

/**
 * The prominent center SCAN button (spec §4). Larger than the other tabs,
 * floats above the bar, camera icon. Assigned via `tabBarButton` on the Scan tab.
 */
export default function ScanTabButton({ onPress, accessibilityState }: BottomTabBarButtonProps) {
  const { colors } = useTheme();
  const focused = accessibilityState?.selected;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan"
        onPress={(e) => onPress?.(e)}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.primary,
            borderColor: colors.background,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
        ]}
      >
        <Ionicons name="scan" size={28} color={colors.onPrimary} />
      </Pressable>
      <Text style={[styles.label, { color: focused ? colors.primary : colors.textMuted }]}>SCAN</Text>
    </View>
  );
}

const SIZE = 64;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-start', width: 84 },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    marginTop: -24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
});
