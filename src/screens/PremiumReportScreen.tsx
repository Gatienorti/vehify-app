import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Bell,
  Car,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  DollarSign,
  Fuel,
  Gauge,
  Gavel,
  Lightbulb,
  Lock,
  ShieldAlert,
  Star,
  Tag,
  TrendingDown,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import VehicleCard from '../components/VehicleCard';
import ScoreBadge from '../components/ScoreBadge';
import PrimaryButton from '../components/PrimaryButton';
import LoadingOverlay from '../components/LoadingOverlay';
import { useGetReportQuery, useRefreshReportMutation } from '../services/api';
import { PRICING, formatUsd } from '../config/pricing';
import { REPORT_OPEN_MESSAGES } from '../config/loadingMessages';
import {
  dealVerdictLabel,
  formatPriceDelta,
  nearestMileageIndex,
  sentenceCase,
  valueBarWidthPct,
} from '../utils/report';
import type { StackScreenProps } from '../types/navigation';
import type { BuyersAnalysis, VehicleHistory } from '../types/vehicle';

type Props = StackScreenProps<'PremiumReport'>;

/** After this many days the report offers a (paid) content refresh. */
const STALE_AFTER_DAYS = 30;

function reportAgeDays(generatedAt: string | null | undefined): number | null {
  if (!generatedAt) return null;
  const generated = new Date(generatedAt).getTime();
  if (Number.isNaN(generated)) return null;
  return Math.floor((Date.now() - generated) / (24 * 60 * 60 * 1000));
}

/* ────────────────────────── building blocks ────────────────────────── */

function StatRow({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statRow, { borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: bad ? colors.danger : colors.text }]}>{value}</Text>
    </View>
  );
}

/** Section header: muted icon normally; danger-tinted only when it holds a problem. */
function SectionHeader({ title, icon: Icon, alert }: { title: string; icon?: LucideIcon; alert?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      {Icon ? <Icon size={17} color={alert ? colors.danger : colors.textMuted} strokeWidth={2.5} /> : null}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
    </View>
  );
}

function Section({
  title,
  icon,
  alert,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  alert?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <>
      <SectionHeader title={title} icon={icon} alert={alert} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {children}
      </View>
    </>
  );
}

/**
 * Long, low-stakes LISTS collapse by default (progressive disclosure) — the
 * header always shows a one-line summary so nothing feels hidden. Verdict
 * content (scores, deal, flags, value) must never be collapsed.
 */
function CollapsibleSection({
  title,
  icon: Icon,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.sectionHeader} hitSlop={8}>
        {Icon ? <Icon size={17} color={colors.textMuted} strokeWidth={2.5} /> : null}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.collapseRight}>
          <Text style={[styles.collapseSummary, { color: colors.textMuted }]}>{summary}</Text>
          <Chevron size={18} color={colors.textMuted} strokeWidth={2.5} />
        </View>
      </Pressable>
      {open ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {children}
        </View>
      ) : null}
    </>
  );
}

/** Inline "show more" row inside a card (e.g. closed investigations). */
function ToggleRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.toggleRow} hitSlop={6}>
      <Text style={[styles.toggleText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

/** Stacked record row: small muted meta line on top, readable body below. */
function RecordRow({ meta, body }: { meta: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.recordRow, { borderColor: colors.border }]}>
      <Text style={[styles.recordMeta, { color: colors.textMuted }]}>{meta}</Text>
      <Text style={[styles.recordBody, { color: colors.text }]}>{body}</Text>
    </View>
  );
}

/* ───────────────────── verdict flags (summary strip) ───────────────────── */

type FlagLevel = 'bad' | 'warn' | 'good';
interface VerdictFlag {
  label: string;
  level: FlagLevel;
}

/** The 5-second answer: the worst findings as chips, or a green all-clear. */
function buildVerdictFlags(analysis: BuyersAnalysis, history: VehicleHistory | null | undefined): VerdictFlag[] {
  const flags: VerdictFlag[] = [];
  if (history?.titleBrands.length) {
    flags.push({ label: `Title: ${history.titleBrands[0]}`, level: 'bad' });
  }
  if ((history?.odometerIssues ?? 0) > 0 || analysis.rollbackDetected) {
    flags.push({ label: 'Odometer issue', level: 'bad' });
  }
  if ((history?.accidents ?? 0) > 0) {
    flags.push({ label: `${history?.accidents} accident${history?.accidents === 1 ? '' : 's'}`, level: 'bad' });
  }
  if ((history?.thefts ?? 0) > 0) {
    flags.push({ label: 'Theft record', level: 'bad' });
  }
  if ((analysis.investigations?.open ?? 0) > 0) {
    flags.push({ label: 'Open investigation', level: 'bad' });
  }
  if (analysis.openRecalls.length > 0) {
    flags.push({ label: `${analysis.openRecalls.length} open recalls`, level: 'warn' });
  }
  if (flags.length === 0) {
    flags.push({ label: history ? 'No major red flags found' : 'No model-level red flags', level: 'good' });
  }
  return flags.slice(0, 5);
}

function FlagChip({ flag }: { flag: VerdictFlag }) {
  const { colors } = useTheme();
  const color =
    flag.level === 'bad' ? colors.danger : flag.level === 'warn' ? colors.warning : colors.success;
  return (
    <View style={[styles.flagChip, { backgroundColor: `${color}1A` }]}>
      <Text style={[styles.flagChipText, { color }]}>{flag.label}</Text>
    </View>
  );
}

/** Dedupe the report's condition flags (providers repeat finding+note pairs). */
function dedupeConditionFlags(
  flags: NonNullable<VehicleHistory['conditionFlags']>,
): NonNullable<VehicleHistory['conditionFlags']> {
  const seen = new Set<string>();
  return flags.filter((f) => {
    const key = `${f.finding}|${f.note ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ─────────────────────────────── screen ─────────────────────────────── */

/** Purchased report — Buyer's Analysis, plus Vehicle History on the complete tier (spec §12–13). */
export default function PremiumReportScreen({ navigation, route }: Props) {
  const { colors, spacing } = useTheme();
  const { vin, reportId, tier } = route.params;
  const { data, isLoading, isError, refetch } = useGetReportQuery(
    { id: reportId ?? `report-${vin}`, vin, tier },
  );
  const [refreshReport, { isLoading: refreshing }] = useRefreshReportMutation();
  const [showAllMileage, setShowAllMileage] = useState(false);
  const [showClosedInvestigations, setShowClosedInvestigations] = useState(false);
  const [showRecalls, setShowRecalls] = useState(false);

  // Tier-aware header — "Vehicle history" was wrong for an analysis report.
  useEffect(() => {
    navigation.setOptions({
      title: tier === 'complete_history' ? 'Premium Report' : 'Buyer Report',
    });
  }, [navigation, tier]);

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
        <LoadingOverlay
          visible
          dim={false}
          title="Opening your report…"
          messages={REPORT_OPEN_MESSAGES}
        />
      </SafeAreaView>
    );
  }

  const { analysis, history } = data;
  const deal = analysis.deal;
  const dealColor =
    deal?.verdict === 'good'
      ? colors.scoreGreen
      : deal?.verdict === 'fair'
        ? colors.scoreYellow
        : deal?.verdict === 'high'
          ? colors.scoreRed
          : colors.textMuted;
  const curve = analysis.valueByMileage ?? [];
  const buyerIdx = nearestMileageIndex(curve, analysis.buyerMileage);
  const ageDays = reportAgeDays(data.generatedAt);

  const verdictFlags = buildVerdictFlags(analysis, history);
  const lastMileage = analysis.mileageHistory[analysis.mileageHistory.length - 1];
  const openInvestigations = analysis.investigations?.items.filter((i) => i.isOpen) ?? [];
  const closedInvestigations = analysis.investigations?.items.filter((i) => !i.isOpen) ?? [];
  const conditionFlags = history?.conditionFlags ? dedupeConditionFlags(history.conditionFlags) : [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {/* Stale-report banner: a report is a snapshot — recalls, investigations
            and market value move. Offer a fresh (paid) pull instead of a stale read. */}
        {ageDays !== null && ageDays >= STALE_AFTER_DAYS ? (
          <View style={[styles.staleBanner, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.staleText, { color: colors.text }]}>
              This report is {ageDays} days old. Recalls, investigations and market value may have
              changed since — pull the latest records.
            </Text>
            {/* TODO RevenueCat: real IAP for REPORT_REFRESH_PRODUCT_ID. */}
            <PrimaryButton
              label={`Update report — ${formatUsd(PRICING.reportRefresh)}`}
              loading={refreshing}
              onPress={() => {
                if (data.id) void refreshReport({ id: data.id });
              }}
              style={{ marginTop: 10 }}
            />
          </View>
        ) : null}

        <VehicleCard vehicle={data.vehicle} />

        {/* Equipment is identity ("what this trim comes with"), so it lives
            with the car — collapsed to one row so the verdict stays on top. */}
        {analysis.factoryEquipment.length ? (
          <CollapsibleSection
            title="Factory equipment"
            icon={ClipboardList}
            summary={`${analysis.factoryEquipment.length} items`}
          >
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>
              Typical equipment for this trim — not a verified build sheet for this exact VIN.
            </Text>
            <View style={styles.equipList}>
              {analysis.factoryEquipment.map((item, i) => (
                <Text key={`${i}-${item}`} style={[styles.equipItem, { color: colors.text }]}>
                  {'•  '}
                  {item}
                </Text>
              ))}
            </View>
          </CollapsibleSection>
        ) : null}

        {/* The 5-second verdict: worst findings as chips (or a green all-clear).
            Everything below is the supporting evidence. */}
        <View style={styles.flagStrip}>
          {verdictFlags.map((f) => (
            <FlagChip key={f.label} flag={f} />
          ))}
        </View>

        {/* v2.1 honesty split — the MODEL's track record, always present. */}
        <ScoreBadge score={analysis.modelScore} label="Model Score" />

        {/* The deal — ONLY when a verdict actually exists. Without a market
            value there is nothing to grade (the Value section already says
            so), and without an asking price there is nothing to say. */}
        {deal?.verdict ? (
          <Section title="The deal" icon={Tag} alert={deal.verdict === 'high'}>
            <View style={styles.dealPillRow}>
              <View style={[styles.dealPill, { backgroundColor: dealColor }]}>
                <Text style={styles.dealPillText}>{dealVerdictLabel(deal.verdict)}</Text>
              </View>
            </View>
            {analysis.askingPrice ? (
              <StatRow label="Asking price" value={`$${analysis.askingPrice.toLocaleString()}`} />
            ) : null}
            {deal.priceDelta != null ? (
              <StatRow
                label="Vs. market value"
                value={formatPriceDelta(deal.priceDelta)}
                bad={deal.verdict === 'high'}
              />
            ) : null}
            <Text style={[styles.cardBody, { color: colors.text }]}>{deal.reason}</Text>
          </Section>
        ) : null}

        <Section title="Our recommendation" icon={Lightbulb}>
          <Text style={[styles.cardBody, styles.reco, { color: colors.text }]}>
            {analysis.recommendation}
          </Text>
        </Section>

        {/* Per-VIN verdict: real Buy Score on complete_history; on the
            analysis tier it is honestly LOCKED — we haven't seen this VIN's
            records yet, and that's the +$5 upsell. */}
        {analysis.buyScore ? (
          <ScoreBadge score={analysis.buyScore} label="Buy Score — this exact car" />
        ) : !history ? (
          <View style={[styles.lockedCard, { backgroundColor: colors.surfaceAlt }]}>
            <View style={styles.lockedHeader}>
              <Lock size={18} color={colors.premium} strokeWidth={2.5} />
              <Text style={[styles.lockedTitle, { color: colors.text }]}>
                {analysis.modelScore.band === 'green'
                  ? 'Model checks out — now verify this exact car'
                  : 'Verify this exact car'}
              </Text>
            </View>
            <Text style={[styles.upsellText, { color: colors.textMuted }]}>
              This analysis hasn&apos;t seen this VIN&apos;s records. Unlock the Buy Score for this
              exact car plus accident, title, theft, odometer, ownership, auction and service
              records.
            </Text>
            <PrimaryButton
              label={`Add Premium Report — +${formatUsd(PRICING.completeUpgrade)}`}
              onPress={() => navigation.navigate('PremiumUpsell', { vin, tier: 'complete_history' })}
              style={{ marginTop: 12 }}
            />
          </View>
        ) : null}

        {/* Value & pricing guidance — the heart of the Buyer's Analysis.
            On a provider no-hit (older/rare vehicles) say so explicitly:
            a silent absence reads as a bug to someone who paid. */}
        {!analysis.estimatedValue && !analysis.suggestedOffer ? (
          <Text style={[styles.emptyLine, { color: colors.textMuted }]}>
            Market value isn&apos;t available for this vehicle from our data sources — coverage is
            thinner for older models. The scores and records above are unaffected.
          </Text>
        ) : (
        <Section title="Value & pricing" icon={DollarSign}>
          {analysis.estimatedValue ? (
            <StatRow
              label={
                analysis.buyerMileage
                  ? `Value at ${analysis.buyerMileage.toLocaleString()} mi`
                  : 'Est. market value'
              }
              value={`$${analysis.estimatedValue.toLocaleString()}`}
            />
          ) : null}
          {analysis.valueLow && analysis.valueHigh ? (
            <StatRow
              label="Typical range"
              value={`$${analysis.valueLow.toLocaleString()} – $${analysis.valueHigh.toLocaleString()}`}
            />
          ) : null}
          {/* No MSRP/depreciation rows — no real data source exists for them
              (CarAPI valuation is a single point value). Never show a
              fabricated dollar claim. */}
          {analysis.suggestedOffer ? (
            <StatRow label="Suggested offer" value={`$${analysis.suggestedOffer.toLocaleString()}`} />
          ) : null}
          {analysis.negotiationAdvice ? (
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>{analysis.negotiationAdvice}</Text>
          ) : null}
        </Section>
        )}

        {/* How mileage moves the price — negotiation ammo, no chart library. */}
        {curve.length ? (
          <Section title="Value vs. mileage" icon={TrendingDown}>
            {curve.map((p, i) => (
              <View key={p.mileage} style={styles.curveRow}>
                <Text
                  style={[
                    styles.curveLabel,
                    { color: i === buyerIdx ? colors.text : colors.textMuted },
                    i === buyerIdx && styles.curveBold,
                  ]}
                >
                  {`${Math.round(p.mileage / 1000)}k mi`}
                </Text>
                <View style={[styles.curveTrack, { backgroundColor: colors.surfaceAlt }]}>
                  <View
                    style={[
                      styles.curveBar,
                      {
                        width: `${valueBarWidthPct(curve, p.estimate)}%`,
                        // Always visibly tinted; full brand blue marks the row
                        // nearest the buyer's entered mileage.
                        backgroundColor: i === buyerIdx ? colors.primary : `${colors.primary}55`,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.curveValue,
                    { color: i === buyerIdx ? colors.text : colors.textMuted },
                    i === buyerIdx && styles.curveBold,
                  ]}
                >
                  {`$${p.estimate.toLocaleString()}`}
                </Text>
              </View>
            ))}
            {buyerIdx >= 0 ? (
              <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                Highlighted row is closest to your entered odometer reading.
              </Text>
            ) : null}
          </Section>
        ) : null}

        {/* Mileage & rollback — HISTORY-class data, present only when real
            odometer records exist (complete_history). The analysis tier never
            fakes a timeline or claims a rollback check it didn't run. */}
        {analysis.mileageHistory.length ? (
          <Section title="Mileage" icon={Gauge} alert={analysis.rollbackDetected}>
            <StatRow
              label="Rollback check"
              value={analysis.rollbackDetected ? 'Discrepancy found' : 'No issues found'}
              bad={analysis.rollbackDetected}
            />
            {lastMileage && !showAllMileage ? (
              <StatRow
                label="Last reported"
                value={`${lastMileage.mileage.toLocaleString()} mi (${lastMileage.date})`}
              />
            ) : null}
            {showAllMileage
              ? analysis.mileageHistory.map((p, i) => (
                  <StatRow key={`${i}-${p.date}`} label={p.date} value={`${p.mileage.toLocaleString()} mi`} />
                ))
              : null}
            {analysis.mileageHistory.length > 1 ? (
              <ToggleRow
                label={
                  showAllMileage
                    ? 'Hide readings'
                    : `Show all ${analysis.mileageHistory.length} readings`
                }
                onPress={() => setShowAllMileage((s) => !s)}
              />
            ) : null}
          </Section>
        ) : null}

        {analysis.maintenanceOutlook ? (
          <Section title="Maintenance outlook" icon={Wrench}>
            <Text style={[styles.cardBody, { color: colors.text }]}>{analysis.maintenanceOutlook}</Text>
          </Section>
        ) : null}

        {/* Federal defect investigations — open ones always visible; the
            closed pile folds away behind a count. */}
        {analysis.investigations ? (
          <Section
            title="Federal defect investigations"
            icon={ShieldAlert}
            alert={analysis.investigations.open > 0}
          >
            <StatRow label="On file for this model" value={String(analysis.investigations.total)} />
            <StatRow
              label="Open now"
              value={String(analysis.investigations.open)}
              bad={analysis.investigations.open > 0}
            />
            {openInvestigations.map((item) => (
              <View key={item.actionNumber} style={[styles.invRow, { borderColor: colors.border }]}>
                <Text style={[styles.invText, { color: colors.danger }]}>
                  <Text style={{ color: colors.danger }}>{item.actionNumber}</Text>
                  <Text style={styles.invOpen}>{'  OPEN'}</Text>
                  {' — '}
                  {sentenceCase(item.subject ?? item.component ?? 'Investigation')}
                  {item.recallCampaign ? ` → recall ${item.recallCampaign}` : ''}
                </Text>
              </View>
            ))}
            {showClosedInvestigations
              ? closedInvestigations.map((item) => (
                  <View key={item.actionNumber} style={[styles.invRow, { borderColor: colors.border }]}>
                    <Text style={[styles.invText, { color: colors.text }]}>
                      <Text style={{ color: colors.textMuted }}>{item.actionNumber}</Text>
                      {' — '}
                      {sentenceCase(item.subject ?? item.component ?? 'Investigation')}
                      {item.recallCampaign ? ` → recall ${item.recallCampaign}` : ''}
                    </Text>
                  </View>
                ))
              : null}
            {closedInvestigations.length ? (
              <ToggleRow
                label={
                  showClosedInvestigations
                    ? 'Hide closed investigations'
                    : `Show ${closedInvestigations.length} closed investigations`
                }
                onPress={() => setShowClosedInvestigations((s) => !s)}
              />
            ) : null}
          </Section>
        ) : null}

        <Section
          title="Recalls & manufacturer records"
          icon={Bell}
          alert={analysis.openRecalls.length > 0}
        >
          <StatRow
            label="Open recalls"
            value={String(analysis.openRecalls.length)}
            bad={analysis.openRecalls.length > 0}
          />
          {showRecalls
            ? analysis.openRecalls.map((r, i) => (
                <RecordRow
                  key={`${i}-${r.id}`}
                  meta={`${r.id}${r.component ? ` · ${sentenceCase(r.component.split(':')[0])}` : ''}`}
                  body={sentenceCase(r.summary)}
                />
              ))
            : null}
          {analysis.openRecalls.length ? (
            <ToggleRow
              label={
                showRecalls
                  ? 'Hide recall details'
                  : `Show ${analysis.openRecalls.length} recall${analysis.openRecalls.length === 1 ? '' : 's'}`
              }
              onPress={() => setShowRecalls((s) => !s)}
            />
          ) : null}
          <StatRow label="Manufacturer communications" value={String(analysis.manufacturerCommunications)} />
          {analysis.complaintTrends ? (
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>{analysis.complaintTrends}</Text>
          ) : null}
        </Section>

        {/* NHTSA crash-test ratings for this model, when on file. */}
        {analysis.safety ? (
          <Section title="Crash safety (NHTSA)" icon={Star}>
            <StatRow
              label="Overall rating"
              value={`${'★'.repeat(Math.max(0, Math.min(5, analysis.safety.overall)))}${'☆'.repeat(
                Math.max(0, 5 - Math.max(0, Math.min(5, analysis.safety.overall))),
              )}  ${analysis.safety.overall}/5`}
            />
            {analysis.safety.front_crash ? (
              <StatRow label="Front crash" value={`${analysis.safety.front_crash}/5`} />
            ) : null}
            {analysis.safety.side_crash ? (
              <StatRow label="Side crash" value={`${analysis.safety.side_crash}/5`} />
            ) : null}
            {analysis.safety.rollover ? (
              <StatRow label="Rollover" value={`${analysis.safety.rollover}/5`} />
            ) : null}
          </Section>
        ) : null}

        {/* EPA fuel economy — snake_case fields are contract-accurate. */}
        {analysis.fuelEconomy ? (
          <Section title="Fuel economy (EPA)" icon={Fuel}>
            <StatRow label="Combined" value={`${analysis.fuelEconomy.combined_mpg} MPG`} />
            {analysis.fuelEconomy.city_mpg && analysis.fuelEconomy.highway_mpg ? (
              <StatRow
                label="City / Highway"
                value={`${analysis.fuelEconomy.city_mpg} / ${analysis.fuelEconomy.highway_mpg} MPG`}
              />
            ) : null}
            {analysis.fuelEconomy.annual_fuel_cost ? (
              <StatRow
                label="Est. annual fuel cost"
                value={`$${analysis.fuelEconomy.annual_fuel_cost.toLocaleString()}`}
              />
            ) : null}
            {analysis.fuelEconomy.co2_gpm ? (
              <StatRow label="CO₂ emissions" value={`${analysis.fuelEconomy.co2_gpm} g/mi`} />
            ) : null}
          </Section>
        ) : null}

        {/* Vehicle History — only on the complete_history tier. */}
        {history ? (
          <>
            <Section title="History summary" icon={Car} alert={history.titleBrands.length > 0}>
              <StatRow label="Accidents reported" value={String(history.accidents)} bad={history.accidents > 0} />
              <StatRow label="Title brands" value={history.titleBrands.length ? history.titleBrands.join(', ') : 'None'} bad={history.titleBrands.length > 0} />
              <StatRow label="Theft records" value={String(history.thefts)} bad={history.thefts > 0} />
              <StatRow label="Odometer issues" value={String(history.odometerIssues)} bad={history.odometerIssues > 0} />
              <StatRow label="Owners" value={history.owners ? String(history.owners) : 'Unknown'} />
            </Section>

            {/* The report's own findings — severity marks the DOT, not whole
                paragraphs; red text is reserved for Alert-level findings. */}
            {conditionFlags.length ? (
              <Section title="Report red flags" icon={AlertTriangle} alert>
                {conditionFlags.map((f, i) => {
                  const sevColor =
                    f.severity === 'Alert'
                      ? colors.danger
                      : f.severity === 'Warning'
                        ? colors.warning
                        : colors.textMuted;
                  const noteItems =
                    f.note && f.note.includes('|') ? f.note.split('|').map((s) => s.trim()) : null;
                  return (
                    <View key={`${f.finding}-${i}`} style={[styles.flagRow, { borderColor: colors.border }]}>
                      <View style={styles.flagHeader}>
                        <View style={[styles.sevDot, { backgroundColor: sevColor }]} />
                        <Text
                          style={[
                            styles.flagTitle,
                            { color: f.severity === 'Alert' ? colors.danger : colors.text },
                          ]}
                        >
                          {f.finding}
                        </Text>
                        {f.ownerGroup ? (
                          <Text style={[styles.flagOwner, { color: colors.textMuted }]}>
                            Owner {f.ownerGroup}
                          </Text>
                        ) : null}
                      </View>
                      {noteItems ? (
                        <View style={styles.flagChipWrap}>
                          {noteItems.map((item) => (
                            <View key={item} style={[styles.flagChip, { backgroundColor: `${sevColor}1A` }]}>
                              <Text style={[styles.flagChipText, { color: sevColor }]}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      ) : f.note ? (
                        <Text style={[styles.flagNote, { color: colors.textMuted }]}>{f.note}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </Section>
            ) : null}

            {/* Ownership timeline — usage patterns, never a person's identity. */}
            {history.ownerDetails?.length ? (
              <Section title="Ownership timeline" icon={Users}>
                {history.ownerDetails.map((o) => (
                  <StatRow
                    key={`owner-${o.owner}`}
                    label={`Owner ${o.owner ?? '?'}${o.purchasedYear ? ` · since ${o.purchasedYear}` : ''}${o.type ? ` · ${o.type}` : ''}`}
                    value={o.events != null ? `${o.events} records` : '—'}
                  />
                ))}
              </Section>
            ) : null}

            {/* Empty sections shrink to one muted line — no empty cards. */}
            {history.auctionRecords.length ? (
              <Section title="Auction history" icon={Gavel}>
                {history.auctionRecords.map((a, i) => (
                  <StatRow
                    key={`${i}-${a.date}`}
                    label={`${a.date}${a.location ? ` · ${a.location}` : ''}`}
                    value={a.price ? `$${a.price.toLocaleString()}` : 'Sold'}
                  />
                ))}
              </Section>
            ) : (
              <Text style={[styles.emptyLine, { color: colors.textMuted }]}>
                Auction history — no sales in available records.
              </Text>
            )}

            {history.serviceHistory.length ? (
              <CollapsibleSection
                title="Service history"
                icon={Wrench}
                summary={`${history.serviceHistory.length} records`}
              >
                {history.serviceHistory.map((s, i) => (
                  <RecordRow
                    key={`${i}-${s.date}`}
                    meta={`${s.date}${s.mileage ? ` · ${s.mileage.toLocaleString()} mi` : ''}`}
                    body={s.description}
                  />
                ))}
              </CollapsibleSection>
            ) : (
              <Text style={[styles.emptyLine, { color: colors.textMuted }]}>
                Service history — no records in available sources. Common for private-party cars,
                and not necessarily a bad sign.
              </Text>
            )}
          </>
        ) : null}
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  collapseRight: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  collapseSummary: { fontSize: 13, fontWeight: '600' },
  toggleRow: { paddingVertical: 12, alignItems: 'center' },
  toggleText: { fontSize: 14, fontWeight: '700' },
  recordRow: { paddingVertical: 10, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  recordMeta: { fontSize: 12.5, fontWeight: '600' },
  recordBody: { fontSize: 14, lineHeight: 20 },
  flagStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flagChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  flagChipText: { fontSize: 12.5, fontWeight: '700' },
  flagChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  flagRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  flagHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flagTitle: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  flagOwner: { fontSize: 12.5, marginLeft: 'auto' },
  flagNote: { fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  sevDot: { width: 9, height: 9, borderRadius: 5 },
  emptyLine: { fontSize: 13.5, lineHeight: 19 },
  reco: { fontSize: 16, lineHeight: 23 },
  body: { fontSize: 14, lineHeight: 20 },
  upsellText: { fontSize: 14, lineHeight: 20 },
  lockedCard: { padding: 16, borderRadius: 16 },
  lockedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  lockedTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  dealPillRow: { paddingTop: 12 },
  dealPill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  dealPillText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  staleBanner: { padding: 14, borderRadius: 14 },
  staleText: { fontSize: 14, lineHeight: 20 },
  invRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  invText: { fontSize: 14, lineHeight: 20 },
  invOpen: { fontWeight: '800' },
  equipList: { paddingVertical: 12, gap: 6 },
  equipItem: { fontSize: 14, lineHeight: 20 },
  curveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  curveLabel: { fontSize: 13, width: 56 },
  curveValue: { fontSize: 13, width: 72, textAlign: 'right' },
  curveTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  curveBar: { height: '100%', borderRadius: 5 },
  curveBold: { fontWeight: '800' },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  errorBody: { fontSize: 14, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
});
