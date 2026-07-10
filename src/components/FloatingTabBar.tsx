import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { brandGradient } from '../theme/colors';

/**
 * Floating, dark, rounded tab bar with a raised center SCAN button.
 * Fully custom (via the Navigator `tabBar` prop) so the center button is
 * always geometrically centered and can float above the bar.
 */

const BAR_BG = '#131B2E';
const ACTIVE = '#FFFFFF';
const INACTIVE = '#7B879C';

const SIDE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  History: 'time-outline',
  Account: 'person-outline',
};

export default function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const go = (routeName: string, key: string, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
  };

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;

          if (route.name === 'Scan') {
            return (
              <View key={route.key} style={styles.centerSlot} pointerEvents="box-none">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Scan"
                  onPress={() => go(route.name, route.key, focused)}
                  style={({ pressed }) => [styles.scanBtn, { transform: [{ scale: pressed ? 0.93 : 1 }] }]}
                >
                  <LinearGradient
                    colors={brandGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.scanGradient}
                  >
                    <Ionicons name="scan" size={34} color="#FFFFFF" />
                  </LinearGradient>
                </Pressable>
              </View>
            );
          }

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => go(route.name, route.key, focused)}
              style={styles.tab}
            >
              <Ionicons
                name={SIDE_ICONS[route.name] ?? 'ellipse-outline'}
                size={28}
                color={focused ? ACTIVE : INACTIVE}
              />
              <Text style={[styles.label, { color: focused ? ACTIVE : INACTIVE }]}>{route.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const BAR_HEIGHT = 74;
const SCAN_SIZE = 70;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    height: BAR_HEIGHT,
    backgroundColor: BAR_BG,
    borderRadius: 24,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: { fontSize: 13, fontWeight: '700' },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBtn: {
    marginTop: -26,
  },
  scanGradient: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: SCAN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
});
