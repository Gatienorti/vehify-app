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
}

export function vehicleTitle(v: Vehicle): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Unknown vehicle';
}

export default function VehicleCard({ vehicle, showVin = true, mask = false, lastVerified }: Props) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>{vehicleTitle(vehicle)}</Text>
      {vehicle.color ? (
        <Text style={[styles.meta, { color: colors.textMuted }]}>Color: {vehicle.color}</Text>
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
});
