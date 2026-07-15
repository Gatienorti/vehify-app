import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { maskVin } from '../utils/vin';
import type { Vehicle } from '../types/vehicle';

interface Props {
  vehicle: Vehicle;
  showVin?: boolean;
  /**
   * Mask the VIN (e.g. a shared/public teaser view). Defaults to false: the
   * user looked this vehicle up, and the VIN isn't private (it's on the
   * windshield/door/title) — showing it in full lets them cross-check for
   * VIN-cloning. DPPA protects owner identity, not the VIN.
   */
  mask?: boolean;
  lastVerified?: string;
  /** Hide the spec chips when the screen shows a full details table instead. */
  showSpecs?: boolean;
}

export function vehicleTitle(v: Vehicle): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Unknown vehicle';
}

export default function VehicleCard({
  vehicle,
  showVin = true,
  mask = false,
  lastVerified,
  showSpecs = true,
}: Props) {
  const { colors, radius, spacing } = useTheme();
  // Identity specs as compact chips — carries "verified" better than prose.
  const specs = [
    vehicle.bodyStyle,
    vehicle.engine,
    vehicle.driveType,
    vehicle.fuelType,
    vehicle.color,
  ].filter((s): s is string => Boolean(s));
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>{vehicleTitle(vehicle)}</Text>
      {showSpecs && specs.length ? (
        <View style={styles.chips}>
          {specs.map((s) => (
            <View key={s} style={[styles.chip, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }]}>
              <Text style={[styles.chipText, { color: colors.textMuted }]}>{s}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {showVin ? (
        <Text style={[styles.meta, { color: colors.textMuted }]} selectable>
          VIN: {mask ? maskVin(vehicle.vin) : vehicle.vin}
        </Text>
      ) : null}
      {lastVerified ? (
        <Text style={[styles.meta, { color: colors.textMuted }]}>Last verified: {lastVerified}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  title: { fontSize: 20, fontWeight: '700' },
  meta: { fontSize: 14, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginBottom: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12.5, fontWeight: '600' },
});
