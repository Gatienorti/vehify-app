import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../theme';
import { vehicleTitle } from './VehicleCard';
import type { Vehicle } from '../types/vehicle';

/**
 * Hero identity card — shared by the Basic check and the paid report so the top
 * of every result screen reads the same. Photo is OPTIONAL: when `imageUrl` is
 * present it lays out photo-left / text-right; with no image (the free tier has
 * none today) it falls back to a clean text-only hero. A soft brand-tinted
 * gradient sets it apart from the white cards below. `badge` labels the tier
 * ("Basic report" / "Buyer report" / "Full report").
 */
export default function VehicleHero({
  vehicle,
  plate,
  imageUrl,
  badge = 'Basic report',
}: {
  vehicle: Vehicle;
  plate?: { plate: string; state?: string };
  imageUrl?: string;
  badge?: string;
}) {
  const { colors, radius, isDark } = useTheme();
  return (
    <LinearGradient
      colors={isDark ? ['#16233F', '#111826'] : ['#EAF2FF', '#F6FAFF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, { borderRadius: radius.lg, borderColor: colors.border }]}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.heroImage} resizeMode="contain" />
      ) : null}
      <View style={styles.heroText}>
        <Text style={[styles.heroTitle, { color: colors.text }]}>{vehicleTitle(vehicle)}</Text>
        <Text style={[styles.heroVin, { color: colors.textMuted }]} selectable>
          VIN: {vehicle.vin}
        </Text>
        {plate ? (
          <Text style={[styles.heroVin, { color: colors.textMuted }]}>
            {plate.plate}
            {plate.state ? ` · ${plate.state}` : ''}
          </Text>
        ) : null}
        <View style={[styles.heroBadge, { backgroundColor: colors.surface }]}>
          <ShieldCheck size={15} color={colors.primary} strokeWidth={2.5} />
          <Text style={[styles.heroBadgeText, { color: colors.primary }]}>{badge}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: { borderWidth: 1, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroImage: { width: 108, height: 84 },
  heroText: { flex: 1, gap: 4 },
  heroTitle: { fontSize: 22, fontWeight: '800', lineHeight: 27 },
  heroVin: { fontSize: 13.5 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 6,
  },
  heroBadgeText: { fontSize: 13, fontWeight: '700' },
});
