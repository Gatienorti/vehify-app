import React, { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import VehicleCard from '../components/VehicleCard';
import PrimaryButton from '../components/PrimaryButton';
import { track } from '../config/analytics';
import { useGetVehicleBasicQuery } from '../services/api';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'BasicResult'>;

/** Free basic result (spec §11). */
export default function BasicResultScreen({ navigation, route }: Props) {
  const { colors, spacing, radius } = useTheme();
  const { vin } = route.params;
  const { data, isLoading } = useGetVehicleBasicQuery(vin);

  useEffect(() => {
    track('basic_report_viewed', { vin });
  }, [vin]);

  if (isLoading || !data) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const recallText =
    data.recalls.length === 0
      ? 'No open recalls found.'
      : `${data.recalls.length} open recall${data.recalls.length === 1 ? '' : 's'} found.`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Basic Vehicle Check</Text>
        <VehicleCard vehicle={data.vehicle} />

        <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Recalls</Text>
          <Text style={[styles.statValue, { color: data.recalls.length ? colors.warning : colors.success }]}>{recallText}</Text>
          {data.estimatedValue ? (
            <>
              <Text style={[styles.statLabel, { color: colors.textMuted, marginTop: 12 }]}>Estimated value</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                ${data.estimatedValue.toLocaleString()}
              </Text>
            </>
          ) : null}
        </View>

        {data.summary ? (
          <Text style={[styles.summary, { color: colors.text }]}>{data.summary}</Text>
        ) : null}

        {/* Upsell to the paid report — the revenue product (spec §12). */}
        <View style={[styles.upsell, { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg }]}>
          <Text style={[styles.upsellText, { color: colors.text }]}>
            Unlock the full report to check accident history, title issues, theft records, odometer
            problems, and auction history.
          </Text>
        </View>
        <PrimaryButton
          label="Unlock Complete History — $4.99"
          onPress={() => {
            track('premium_cta_viewed', { vin });
            navigation.navigate('PremiumUpsell', { vin });
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  stat: { borderWidth: 1, padding: 16 },
  statLabel: { fontSize: 13, fontWeight: '600' },
  statValue: { fontSize: 17, fontWeight: '700', marginTop: 2 },
  summary: { fontSize: 15, lineHeight: 22 },
  upsell: { padding: 16 },
  upsellText: { fontSize: 14, lineHeight: 20 },
});
