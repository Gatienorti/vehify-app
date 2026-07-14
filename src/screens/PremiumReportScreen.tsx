import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import VehicleCard from '../components/VehicleCard';
import ScoreBadge from '../components/ScoreBadge';
import PrimaryButton from '../components/PrimaryButton';
import { useGetReportQuery } from '../services/api';
import { PRICING, formatUsd } from '../config/pricing';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'PremiumReport'>;

function StatRow({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statRow, { borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: bad ? colors.danger : colors.text }]}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {children}
      </View>
    </>
  );
}

/** Purchased report — Buyer's Analysis, plus Vehicle History on the complete tier (spec §12–13). */
export default function PremiumReportScreen({ navigation, route }: Props) {
  const { colors, spacing } = useTheme();
  const { vin, reportId, tier } = route.params;
  const { data, isLoading, isError, refetch } = useGetReportQuery(
    { id: reportId ?? `report-${vin}`, vin, tier },
  );

  if (isError) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Couldn&apos;t load your report</Text>
        <Text style={[styles.errorBody, { color: colors.textMuted }]}>
          Your purchase is safe — check your connection and try again.
        </Text>
        <PrimaryButton label="Try again" onPress={() => void refetch()} style={{ marginTop: 16, alignSelf: 'stretch', marginHorizontal: 24 }} />
      </SafeAreaView>
    );
  }

  if (isLoading || !data) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const { analysis, history } = data;
  const lastMileage = analysis.mileageHistory[analysis.mileageHistory.length - 1];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <VehicleCard vehicle={data.vehicle} />
        <ScoreBadge score={analysis.buyScore} />
        <Text style={[styles.reco, { color: colors.text }]}>{analysis.recommendation}</Text>

        {/* Value & pricing guidance — the heart of the Buyer's Analysis. */}
        <Section title="Value & pricing">
          {analysis.estimatedValue ? (
            <StatRow label="Est. market value" value={`$${analysis.estimatedValue.toLocaleString()}`} />
          ) : null}
          {analysis.msrp ? (
            <StatRow label="Original MSRP" value={`$${analysis.msrp.toLocaleString()}`} />
          ) : null}
          {analysis.depreciationPct != null ? (
            <StatRow label="Depreciation" value={`−${analysis.depreciationPct}% since new`} />
          ) : null}
          {analysis.suggestedOffer ? (
            <StatRow label="Suggested offer" value={`$${analysis.suggestedOffer.toLocaleString()}`} />
          ) : null}
        </Section>
        {analysis.negotiationAdvice ? (
          <Text style={[styles.body, { color: colors.textMuted }]}>{analysis.negotiationAdvice}</Text>
        ) : null}

        {/* Mileage & rollback — calm phrasing, red only on a confirmed signal. */}
        <Section title="Mileage">
          <StatRow
            label="Rollback check"
            value={analysis.rollbackDetected ? 'Discrepancy found' : 'No issues found'}
            bad={analysis.rollbackDetected}
          />
          {lastMileage ? (
            <StatRow label="Last reported" value={`${lastMileage.mileage.toLocaleString()} mi (${lastMileage.date})`} />
          ) : null}
          {analysis.mileageHistory.map((p) => (
            <StatRow key={`${p.date}-${p.mileage}`} label={p.date} value={`${p.mileage.toLocaleString()} mi`} />
          ))}
        </Section>

        {analysis.maintenanceOutlook ? (
          <Section title="Maintenance outlook">
            <Text style={[styles.cardBody, { color: colors.text }]}>{analysis.maintenanceOutlook}</Text>
          </Section>
        ) : null}

        {analysis.factoryEquipment.length ? (
          <Section title="Factory equipment">
            <Text style={[styles.cardBody, { color: colors.text }]}>
              {analysis.factoryEquipment.join('  ·  ')}
            </Text>
          </Section>
        ) : null}

        <Section title="Recalls & manufacturer records">
          <StatRow
            label="Open recalls"
            value={String(analysis.openRecalls.length)}
            bad={analysis.openRecalls.length > 0}
          />
          <StatRow label="Manufacturer communications" value={String(analysis.manufacturerCommunications)} />
        </Section>
        {analysis.complaintTrends ? (
          <Text style={[styles.body, { color: colors.textMuted }]}>{analysis.complaintTrends}</Text>
        ) : null}

        {/* Vehicle History — only on the complete_history tier. */}
        {history ? (
          <>
            <Section title="Vehicle history">
              <StatRow label="Accidents reported" value={String(history.accidents)} bad={history.accidents > 0} />
              <StatRow label="Title brands" value={history.titleBrands.length ? history.titleBrands.join(', ') : 'None'} bad={history.titleBrands.length > 0} />
              <StatRow label="Theft records" value={String(history.thefts)} bad={history.thefts > 0} />
              <StatRow label="Odometer issues" value={String(history.odometerIssues)} bad={history.odometerIssues > 0} />
              <StatRow label="Owners" value={history.owners ? String(history.owners) : 'Unknown'} />
            </Section>

            <Section title="Auction history">
              {history.auctionRecords.length ? (
                history.auctionRecords.map((a) => (
                  <StatRow
                    key={`${a.date}-${a.location ?? ''}`}
                    label={`${a.date}${a.location ? ` · ${a.location}` : ''}`}
                    value={a.price ? `$${a.price.toLocaleString()}` : 'Sold'}
                  />
                ))
              ) : (
                <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                  No auction sales in available records.
                </Text>
              )}
            </Section>

            <Section title="Service history">
              {history.serviceHistory.length ? (
                history.serviceHistory.map((s) => (
                  <StatRow
                    key={`${s.date}-${s.description}`}
                    label={`${s.date}${s.mileage ? ` · ${s.mileage.toLocaleString()} mi` : ''}`}
                    value={s.description}
                  />
                ))
              ) : (
                <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                  No service records in available sources — common for private-party cars, and not
                  necessarily a bad sign.
                </Text>
              )}
            </Section>
          </>
        ) : (
          /* Buyer's Analysis tier — offer the Complete History upgrade (+$5). */
          <View style={[styles.upsell, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.upsellText, { color: colors.text }]}>
              Add the full history — accident, title, theft, odometer, ownership, auction records
              and photos, and service history for this exact VIN.
            </Text>
            <PrimaryButton
              label={`Add Complete History — +${formatUsd(PRICING.completeUpgrade)}`}
              onPress={() =>
                navigation.navigate('PremiumUpsell', { vin, tier: 'complete_history' })
              }
              style={{ marginTop: 12 }}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4 },
  cardBody: { fontSize: 14, lineHeight: 20, paddingVertical: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  statLabel: { fontSize: 15, flexShrink: 0 },
  statValue: { fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'right' },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  reco: { fontSize: 16, lineHeight: 23 },
  body: { fontSize: 14, lineHeight: 20 },
  upsell: { padding: 16, borderRadius: 16 },
  upsellText: { fontSize: 14, lineHeight: 20 },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  errorBody: { fontSize: 14, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
});
