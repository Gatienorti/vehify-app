import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { maskVin } from '../utils/vin';
import type { Vehicle } from '../types/vehicle';

interface Props {
  vehicle: Vehicle;
  showVin?: boolean;
  lastVerified?: string;
}

export function vehicleTitle(v: Vehicle): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Unknown vehicle';
}

export default function VehicleCard({ vehicle, showVin = true, lastVerified }: Props) {
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
        <Text style={[styles.meta, { color: colors.textMuted }]}>VIN: {maskVin(vehicle.vin)}</Text>
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
