import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useTheme } from '../theme';
import {
  VAuction,
  VComparables,
  VCrashSafety,
  VDeal,
  VDepreciation,
  VEvOwnership,
  VFactoryEquipment,
  VFuelEconomy,
  VHistorySummary,
  VInvestigationsOpen,
  VLock,
  VMaintenance,
  VMileage,
  VOwnership,
  VRecallsNotices,
  VRecommendation,
  VRedFlags,
  VSpecs,
  VTitleRecords,
  VValuePricing,
} from '../components/vehifyIcons';
import MarketValueCurve from '../components/MarketValueCurve';
import MileageHistoryChart from '../components/MileageHistoryChart';
import VehicleHero from '../components/VehicleHero';
import SpecGrid, { type SpecEntry, type IconCmp } from '../components/SpecGrid';
import ScoreBadge from '../components/ScoreBadge';
import PrimaryButton from '../components/PrimaryButton';
import LoadingOverlay from '../components/LoadingOverlay';
import {
  useGetReportQuery,
  useRefreshReportMutation,
  useRetryReportMutation,
} from '../services/api';
import { PurchaseCancelledError, purchaseThroughStore } from '../hooks/usePurchaseReport';
import { PRICING, REPORT_REFRESH_PRODUCT_ID, creditCostFor, creditLabel, formatUsd } from '../config/pricing';
import { useCredits } from '../hooks/useCredits';
import { useCreditHeaderButton } from '../components/CreditBadge';
import { BUILDING_REPORT_MESSAGES, REPORT_OPEN_MESSAGES } from '../config/loadingMessages';
import { isReportReady } from '../types/api';
import {
  dealVerdictLabel,
  formatPriceDelta,
  nearestMileageIndex,
  recallComponentLabel,
  sentenceCase,
  shortDate,
  valueBarWidthPct,
} from '../utils/report';
import type { StackScreenProps } from '../types/navigation';
import type { BuyersAnalysis, OwnershipCost, Vehicle, VehicleHistory } from '../types/vehicle';

type Props = StackScreenProps<'PremiumReport'>;

/** After this many days the report offers a (paid) content refresh. */
const STALE_AFTER_DAYS = 30;

/** Poll cadence while the backend's queued build runs (generation ≈ 6–18s). */
const GENERATING_POLL_MS = 2500;

/**
 * Give up polling after this long — a stuck job must not spin the phone
 * forever. Longer than the backend job's WORST-case retry timeline (3
 * attempts + 15s/60s backoffs ≈ 150s), so a slow-but-succeeding build never
 * shows the failure screen.
 */
const GENERATING_CAP_MS = 180_000;

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
function SectionHeader({ title, icon: Icon, alert }: { title: string; icon?: IconCmp; alert?: boolean }) {
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
  premium,
  children,
}: {
  title: string;
  icon?: IconCmp;
  alert?: boolean;
  /** Complete-History (per-VIN) content — subtle brand accent, never severity colors. */
  premium?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <>
      <SectionHeader title={title} icon={icon} alert={alert} />
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
          premium && { borderLeftWidth: 3, borderLeftColor: colors.premium },
        ]}
      >
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
  alert,
  premium,
  children,
}: {
  title: string;
  icon?: IconCmp;
  summary: string;
  defaultOpen?: boolean;
  /** Danger-tint the icon — a collapsed section may still hold a problem. */
  alert?: boolean;
  /** Complete-History (per-VIN) content — subtle brand accent, never severity colors. */
  premium?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${open ? 'collapse' : 'expand'}`}
        onPress={() => setOpen((o) => !o)}
        style={styles.sectionHeader}
        hitSlop={8}
      >
        {Icon ? <Icon size={17} color={alert ? colors.danger : colors.textMuted} strokeWidth={2.5} /> : null}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.collapseRight}>
          <Text numberOfLines={1} style={[styles.collapseSummary, { color: colors.textMuted }]}>{summary}</Text>
          <Chevron size={18} color={colors.textMuted} strokeWidth={2.5} />
        </View>
      </Pressable>
      {open ? (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
            premium && { borderLeftWidth: 3, borderLeftColor: colors.premium },
          ]}
        >
          {children}
        </View>
      ) : null}
    </>
  );
}

/**
 * Full free-decode spec sheet — parity with the web report's Specifications
 * card. Rows with no data are skipped entirely (never a "No data" filler);
 * collapsed by default: it's reference material, not verdict.
 */
function SpecificationsSection({ vehicle }: { vehicle: Vehicle }) {
  // [label, value, wide?] — long values get a full-width row; the rest pair
  // two-across in the shared SpecGrid (same layout as the Basic check).
  const raw: [string, string | undefined, boolean?][] = [
    ['Trim', vehicle.trim],
    ['Displacement', vehicle.displacement ? `${vehicle.displacement} L` : undefined],
    ['Cylinders', vehicle.cylinders ? String(vehicle.cylinders) : undefined],
    ['Engine config', vehicle.engineConfiguration],
    ['Turbo', vehicle.turbo],
    ['Horsepower', vehicle.horsepower ? `${vehicle.horsepower} hp` : undefined],
    [
      'Transmission',
      vehicle.transmission
        ? vehicle.transmissionSpeeds
          ? `${vehicle.transmissionSpeeds}-speed ${vehicle.transmission}`
          : vehicle.transmission
        : undefined,
      true,
    ],
    ['Doors', vehicle.doors ? String(vehicle.doors) : undefined],
    ['Seats', vehicle.seats ? String(vehicle.seats) : undefined],
    ['Series', vehicle.series],
    ['Vehicle type', vehicle.vehicleType],
    ['Assembled in', [vehicle.plantCity, vehicle.plantCountry].filter(Boolean).join(', ') || undefined, true],
    ['GVWR class', vehicle.gvwrClass],
    ['Wheelbase', vehicle.wheelbase ? `${vehicle.wheelbase} in` : undefined],
    ['Curb weight', vehicle.curbWeight ? `${vehicle.curbWeight.toLocaleString()} lb` : undefined],
    ['ABS', vehicle.abs],
    ['Electrification', vehicle.electrification],
    [
      'Battery',
      vehicle.batteryKwh
        ? `${vehicle.batteryKwh} kWh${vehicle.batteryType ? ` ${vehicle.batteryType}` : ''}`
        : vehicle.batteryType,
      true,
    ],
  ];
  const entries: SpecEntry[] = raw
    .filter((e): e is [string, string, boolean?] => Boolean(e[1]))
    .map(([label, value, wide]) => ({ label, value, wide }));

  if (entries.length === 0) return null;

  return (
    <CollapsibleSection title="Specifications" icon={VSpecs} summary={`${entries.length} details`} defaultOpen>
      <SpecGrid entries={entries} />
    </CollapsibleSection>
  );
}

/** Chart palette — brand-blue family, assigned by slice order. Deliberately
 *  NOT the severity colors: a cost chart carries no good/bad judgement. */
const OC_PALETTE = ['#1E63EB', '#38A3F5', '#2EC4B6', '#63D68C', '#A8CFF0', '#C9D8F0'];

/**
 * Typical 5-year ownership cost — fuel is real (EPA × this week's pump
 * price), depreciation is our valuation heuristic (premium only), the rest
 * are U.S. typical-cost tables. Copy stays hedged ("typical", "varies").
 */
function OwnershipCostSection({ cost, upsell }: { cost: OwnershipCost; upsell: boolean }) {
  const { colors } = useTheme();
  return (
    <CollapsibleSection
      title={`${cost.years}-year ownership cost`}
      icon={VValuePricing}
      summary={`≈ $${cost.total.toLocaleString()}`}
      premium={cost.includesDepreciation}
      defaultOpen
    >
      <Text style={[styles.ocHeadline, { color: colors.text }]}>
        ≈ ${cost.total.toLocaleString()}
        <Text style={[styles.ocHeadlineSub, { color: colors.textMuted }]}>
          {`  over ${cost.years} years · $${cost.costPerMile.toFixed(2)}/mi`}
        </Text>
      </Text>
      {/* Stacked share bar — widths proportional to each slice. */}
      <View style={styles.ocBar}>
        {cost.slices.map((s, i) => (
          <View key={s.key} style={{ flex: s.total, backgroundColor: OC_PALETTE[i % OC_PALETTE.length] }} />
        ))}
      </View>
      {cost.slices.map((s, i) => (
        <View key={s.key} style={[styles.statRow, { borderColor: colors.border }]}>
          <View style={styles.ocRowLeft}>
            <View style={[styles.ocDot, { backgroundColor: OC_PALETTE[i % OC_PALETTE.length] }]} />
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
          </View>
          <Text style={[styles.statValue, { color: colors.text }]}>${s.total.toLocaleString()}</Text>
        </View>
      ))}
      <Text style={[styles.sourceNote, { color: colors.textMuted }]}>
        Typical costs for this type of vehicle — U.S. averages
        {cost.state ? ` (insurance: ${cost.state} basis)` : ''}, {cost.milesPerYear.toLocaleString()} mi/yr
        {cost.slices.some((s) => s.key === 'fuel') ? ', fuel at this week’s price' : ''}. Actual costs vary.
      </Text>
      {upsell ? (
        <Text style={[styles.sourceNote, { color: colors.textMuted }]}>
          A depreciation estimate for this exact car is included with the Complete History upgrade.
        </Text>
      ) : null}
    </CollapsibleSection>
  );
}

/** Inline "show more" row inside a card (e.g. closed investigations). */
function ToggleRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.toggleRow} hitSlop={6}>
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
  useCreditHeaderButton();
  const { vin, reportId, tier } = route.params;
  // The backend builds report content on a queue: until it finishes, GET
  // returns {status:'generating'} and we poll — the loading overlay stays up
  // the whole time, exactly like the old synchronous confirm felt.
  const [pollingInterval, setPollingInterval] = useState(0);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const { data, isLoading, isError, error, refetch } = useGetReportQuery(
    { id: reportId ?? `report-${vin}`, vin, tier },
    { pollingInterval },
  );
  const [refreshReport, { isLoading: refreshing }] = useRefreshReportMutation();
  const [payingRefresh, setPayingRefresh] = useState(false);
  // Upgrade is an UPGRADE credit cost (Buyer Report already owned). The actual
  // spend happens on the upsell screen; here we only match the button label so
  // credits-first is consistent across the flow.
  const { balance: creditBalance } = useCredits();
  const upgradeCreditCost = creditCostFor('complete_history', true);
  const upgradeWithCredit = creditBalance >= upgradeCreditCost;
  // The $2 report refresh is a CONSUMABLE store purchase (RevenueCat) followed
  // by the backend re-queue. Cancel is silence; a store failure never fires
  // the refresh call.
  const paidRefresh = async () => {
    if (!data?.id || payingRefresh) return;
    setPayingRefresh(true);
    try {
      const transactionId = await purchaseThroughStore(REPORT_REFRESH_PRODUCT_ID);
      // The backend verifies + consumes this exact transaction (once).
      await refreshReport({ id: data.id, transactionId }).unwrap();
    } catch (e) {
      if (!(e instanceof PurchaseCancelledError)) {
        Alert.alert('Update didn’t complete', 'Please try again.');
      }
    } finally {
      setPayingRefresh(false);
    }
  };
  const [retryReport, { isLoading: retrying }] = useRetryReportMutation();
  const [showClosedInvestigations, setShowClosedInvestigations] = useState(false);
  const [showRecalls, setShowRecalls] = useState(false);

  // `!= null` (not `!== undefined`): a null body from the API must land in the
  // loading state, not crash on `.status` (seen on the Android dev build).
  const generating =
    data != null && !isReportReady(data) && data.status === 'generating' && !pollTimedOut;

  // Start/stop the poll from what the server last said — render-phase state
  // adjustment (per React docs), not an effect: no cascading render warning.
  const desiredInterval = generating ? GENERATING_POLL_MS : 0;
  if (pollingInterval !== desiredInterval) {
    setPollingInterval(desiredInterval);
  }

  // Safety cap: if the build never lands, stop polling and offer a retry.
  useEffect(() => {
    if (!generating) return;
    const timer = setTimeout(() => setPollTimedOut(true), GENERATING_CAP_MS);
    return () => clearTimeout(timer);
  }, [generating]);

  // Tier-aware header — "Vehicle history" was wrong for an analysis report.
  useEffect(() => {
    navigation.setOptions({
      title: tier === 'complete_history' ? 'Premium Report' : 'Buyer Report',
    });
  }, [navigation, tier]);

  if (isError) {
    // A 404 means the report isn't on the server (e.g. a stale local ownership
    // pointer to a rebuilt backend) — don't dead-end; send the user to the free
    // Basic result. Other errors (network) keep the retry path.
    const notFound = (error as { status?: number } | undefined)?.status === 404;
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          {notFound ? 'That report isn’t available' : 'Couldn’t load your report'}
        </Text>
        <Text style={[styles.errorBody, { color: colors.textMuted }]}>
          {notFound
            ? 'We couldn’t find this report anymore. You can still see the free basic details for this vehicle.'
            : 'Your purchase is safe — check your connection and try again.'}
        </Text>
        {notFound ? (
          <PrimaryButton
            label="See basic details"
            onPress={() => navigation.replace('BasicResult', { vin })}
            style={{ marginTop: 16, alignSelf: 'stretch', marginHorizontal: 24 }}
          />
        ) : (
          <PrimaryButton label="Try again" onPress={() => void refetch()} style={{ marginTop: 16, alignSelf: 'stretch', marginHorizontal: 24 }} />
        )}
      </SafeAreaView>
    );
  }

  // The queued build burned its retries (or our poll cap hit). The purchase
  // is safe — recovery is a FREE re-queue via /retry.
  if (data != null && !isReportReady(data) && (data.status === 'failed' || pollTimedOut)) {
    const pendingId = data.id;
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          Your report is taking longer than usual
        </Text>
        <Text style={[styles.errorBody, { color: colors.textMuted }]}>
          Your purchase is safe — the records run hit a snag. Try again and we’ll rebuild it at no
          extra charge.
        </Text>
        <PrimaryButton
          label="Try again"
          loading={retrying}
          onPress={() => {
            setPollTimedOut(false);
            void retryReport({ id: pendingId });
          }}
          style={{ marginTop: 16, alignSelf: 'stretch', marginHorizontal: 24 }}
        />
      </SafeAreaView>
    );
  }

  if (isLoading || !data || !isReportReady(data)) {
    // Still building server-side → the same overlay + rotating copy the buyer
    // saw during purchase, riding on the poll instead of a held-open request.
    const building = data !== undefined && !isReportReady(data);
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <LoadingOverlay
          visible
          dim={false}
          title={
            building
              ? tier === 'complete_history'
                ? 'Adding the full history…'
                : 'Building your analysis…'
              : 'Opening your report…'
          }
          messages={building ? BUILDING_REPORT_MESSAGES : REPORT_OPEN_MESSAGES}
        />
      </SafeAreaView>
    );
  }

  const { analysis, history } = data;

  // The backend resource can emit analysis: null on a corrupt/legacy row even
  // when the report reads "ready" — render the not-found fallback instead of
  // crashing on the first analysis.* dereference below.
  if (!analysis) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          That report isn&apos;t available
        </Text>
        <Text style={[styles.errorBody, { color: colors.textMuted }]}>
          This report has no analysis data anymore. You can still see the free basic details for
          this vehicle.
        </Text>
        <PrimaryButton
          label="See basic details"
          onPress={() => navigation.replace('BasicResult', { vin })}
          style={{ marginTop: 16, alignSelf: 'stretch', marginHorizontal: 24 }}
        />
      </SafeAreaView>
    );
  }

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
  // Highlight anchor = the mileage the valuation was computed at, mirroring
  // the backend blend: the last RECORDED odometer reading wins when higher
  // (records are credible), else the legacy buyer entry on old reports.
  const lastRecorded = analysis.mileageHistory.length
    ? analysis.mileageHistory[analysis.mileageHistory.length - 1].mileage
    : null;
  const anchorMileage =
    lastRecorded != null && (analysis.buyerMileage == null || lastRecorded > analysis.buyerMileage)
      ? lastRecorded
      : analysis.buyerMileage;
  const buyerIdx = nearestMileageIndex(curve, anchorMileage);
  const ageDays = reportAgeDays(data.generatedAt);

  // Rendered inside the premium block on complete_history, and standalone on
  // LEGACY pre-split Buyer reports that stored a curve — one definition so the
  // two spots can never drift.
  const valueCurveSection = curve.length ? (
    <Section title="Value vs. mileage" icon={VDepreciation} premium>
      <Text style={[styles.cardBody, { color: colors.textMuted, marginBottom: 8 }]}>
        Estimated — projected from the current market value to show how
        mileage typically moves the price. Not per-mile sale data.
      </Text>
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
                  // Always visibly tinted; full brand blue marks the
                  // row nearest this car's odometer.
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
    </Section>
  ) : null;

  const verdictFlags = buildVerdictFlags(analysis, history);
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
            <PrimaryButton
              label={`Update report — ${formatUsd(PRICING.reportRefresh)}`}
              loading={refreshing || payingRefresh}
              onPress={() => void paidRefresh()}
              style={{ marginTop: 10 }}
            />
          </View>
        ) : null}

        <VehicleHero vehicle={data.vehicle} badge={history ? 'Full report' : 'Buyer report'} />

        {/* The 5-second verdict: worst findings as chips (or a green all-clear).
            Everything below is the supporting evidence. */}
        <View style={styles.flagStrip}>
          {verdictFlags.map((f) => (
            <FlagChip key={f.label} flag={f} />
          ))}
        </View>

        {/* The verdict leads: the best score owned — per-VIN Buy Score on
            premium, Model Score on the analysis tier. (Premium also shows
            Model Score lower down as supporting context.) */}
        {history && analysis.buyScore ? (
          <ScoreBadge score={analysis.buyScore} label="Buy Score — this exact car" premium />
        ) : !history && analysis.modelScore ? (
          <ScoreBadge score={analysis.modelScore} label="Model Score" />
        ) : null}

        {/* Where the per-VIN Buy Score would sit on premium: a one-line locked
            hint — plants the upgrade early without interrupting the report.
            The full CTA card lives at the end, after the recommendation. */}
        {!history ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See Premium upgrade"
            onPress={() => navigation.navigate('PremiumUpsell', { vin, tier: 'complete_history' })}
            style={[styles.upsellHint, { backgroundColor: colors.primary }]}
          >
            <VLock size={16} color={colors.onPrimary} />
            <Text style={[styles.upsellHintText, { color: colors.onPrimary }]}>
              Buy Score & records for this exact car
            </Text>
          </Pressable>
        ) : null}

        {/* Analysis tier: the money block right after the verdict chips.
            (Premium renders it inside the per-VIN block instead.) */}
        {!history && analysis.ownershipCost ? (
          <OwnershipCostSection cost={analysis.ownershipCost} upsell />
        ) : null}

        {/* Premium-first: what the +$3 unlocked leads the page — banner,
            per-VIN Buy Score and this VIN's records. Model-level context
            collapses below (open only while it holds an active finding). */}
        {history ? (
          <>
            {/* The verdict's evidence headline — badges, title brands,
                accident/theft counts — directly under the Buy Score. */}
            <Section title="History summary" icon={VHistorySummary} alert={history.titleBrands.length > 0} premium>
              {/* The report's own badges — its official designations. */}
              {history.highlights?.length ? (
                <View style={[styles.flagChipWrap, styles.highlightWrap]}>
                  {history.highlights.map((h) => (
                    <View key={h} style={[styles.flagChip, { backgroundColor: `${colors.scoreGreen}1A` }]}>
                      <Text style={[styles.flagChipText, { color: colors.scoreGreen }]}>{h}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <StatRow label="Accidents reported" value={String(history.accidents)} bad={history.accidents > 0} />
              <StatRow label="Title brands" value={history.titleBrands.length ? history.titleBrands.join(', ') : 'None'} bad={history.titleBrands.length > 0} />
              <StatRow label="Theft records" value={String(history.thefts)} bad={history.thefts > 0} />
              <StatRow label="Odometer issues" value={String(history.odometerIssues)} bad={history.odometerIssues > 0} />
              <StatRow label="Owners" value={history.owners ? String(history.owners) : 'Unknown'} />
              {history.locations?.length ? (
                <StatRow label="Registered in" value={history.locations.join(', ')} />
              ) : null}
              {history.warranty ? <StatRow label="Warranty" value={history.warranty} /> : null}
              {/* Per-VIN flag from the report itself — distinct from the
                  model-level recall list further down. */}
              {history.openRecallReported != null ? (
                <StatRow
                  label="Open recall on this car"
                  value={history.openRecallReported ? 'Yes — not yet repaired' : 'None reported'}
                  bad={history.openRecallReported}
                />
              ) : null}
              {history.lienRecords?.length ? (
                <>
                  <StatRow
                    label="Loan / lien reported"
                    value={history.lienRecords.map((l) => l.date.slice(0, 4)).join(', ')}
                  />
                  <Text style={[styles.sourceNote, { color: colors.textMuted }]}>
                    A loan or lien was reported — confirm it has been released before the title
                    transfers to you.
                  </Text>
                </>
              ) : null}
              {history.autocheckScore ? (
                <StatRow
                  label="History score"
                  value={
                    history.autocheckScore.rangeLow != null
                      ? `${history.autocheckScore.score} (similar cars: ${history.autocheckScore.rangeLow}–${history.autocheckScore.rangeHigh ?? '?'})`
                      : String(history.autocheckScore.score)
                  }
                  bad={
                    history.autocheckScore.rangeLow != null &&
                    history.autocheckScore.score < history.autocheckScore.rangeLow
                  }
                />
              ) : null}
            </Section>

            {/* Value & pricing — ONE fused card: the record-derived value,
                the history events that moved it, and the offer guidance.
                (Fused with the old "History-based value" section: since the
                CheapVHR fold they were the SAME number twice.) On a provider
                no-hit (older/rare vehicles) say so explicitly: a silent
                absence reads as a bug to someone who paid for valuation. */}
            {!analysis.estimatedValue && !analysis.suggestedOffer && !history.historyBasedValue ? (
              <Text style={[styles.emptyLine, { color: colors.textMuted }]}>
                Market value isn&apos;t available for this vehicle from our data sources — coverage
                is thinner for older models. The scores and records are unaffected.
              </Text>
            ) : (
              <Section title="Value & pricing" icon={VValuePricing} premium>
                {/* Headline: the market-value bell curve (same picture as the
                    web report) — estimate at the peak, below/above-market
                    shoulders, legacy asking price as a gold marker. A legacy
                    report without an estimate falls back to the history
                    report's own retail value so the card never opens blank. */}
                {analysis.estimatedValue ? (
                  <>
                    {/* No comps/mileage footnotes here — comps have their own
                        section and the value-vs-mileage graph follows next. */}
                    <MarketValueCurve
                      average={analysis.estimatedValue}
                      low={analysis.valueLow}
                      high={analysis.valueHigh}
                      asking={analysis.askingPrice}
                    />
                  </>
                ) : history.historyBasedValue ? (
                  <StatRow
                    label="Retail value (from its records)"
                    value={`$${history.historyBasedValue.amount.toLocaleString()}`}
                  />
                ) : null}
                {/* WHY the number is what it is — the history events that
                    moved it (accident down, one-owner up). The best rows in
                    the section: they explain the headline. */}
                {history.historyBasedValue?.events.map((e) => (
                  <View key={e.label} style={styles.hbvEventRow}>
                    {e.direction === 'down' ? (
                      <TrendingDown size={15} color={colors.danger} strokeWidth={2.5} />
                    ) : (
                      <TrendingUp size={15} color={colors.scoreGreen} strokeWidth={2.5} />
                    )}
                    <Text
                      style={[
                        styles.hbvEventText,
                        { color: e.direction === 'down' ? colors.danger : colors.text },
                      ]}
                    >
                      {e.label}
                    </Text>
                  </View>
                ))}
                {/* Range row removed — the curve's shoulders show low/high.
                    Kept only when there's NO curve (legacy retail-value path). */}
                {!analysis.estimatedValue && analysis.valueLow && analysis.valueHigh ? (
                  <StatRow
                    label="Estimated range"
                    value={`$${analysis.valueLow.toLocaleString()} – $${analysis.valueHigh.toLocaleString()}`}
                  />
                ) : null}
                {/* Legacy dual-anchor: an old report whose estimate came from
                    CarAPI shows the history value as a second row. On new
                    reports they're the SAME number (folded) → suppressed. */}
                {analysis.estimatedValue &&
                history.historyBasedValue &&
                history.historyBasedValue.amount !== analysis.estimatedValue ? (
                  <StatRow
                    label="History-based retail value"
                    value={`$${history.historyBasedValue.amount.toLocaleString()}`}
                  />
                ) : null}
                {/* Real MSRP (carapi.app trims, ~2015–2020) — shown only when
                    the provider has it; hidden otherwise, never fabricated. */}
                {analysis.msrp ? (
                  <StatRow label="Original MSRP" value={`$${analysis.msrp.toLocaleString()}`} />
                ) : null}
                {analysis.depreciationPct != null ? (
                  <StatRow label="Lost since new" value={`~${analysis.depreciationPct}%`} />
                ) : null}
                {analysis.suggestedOffer ? (
                  <StatRow label="Suggested offer" value={`$${analysis.suggestedOffer.toLocaleString()}`} />
                ) : null}
                {analysis.negotiationAdvice ? (
                  <Text style={[styles.cardBody, { color: colors.textMuted }]}>{analysis.negotiationAdvice}</Text>
                ) : null}
              </Section>
            )}

            {/* How mileage moves the price — negotiation ammo, no chart
                library. A projection from the single market estimate, NOT
                observed per-mile sale data, so it's labelled as an estimate. */}
            {valueCurveSection}

            {/* Directly after the price block (user decision) — what the NEXT
                five years cost, right after what the car costs today. */}
            {analysis.ownershipCost ? (
              <OwnershipCostSection cost={analysis.ownershipCost} upsell={false} />
            ) : null}


            {/* Mileage & rollback — HISTORY-class data, gated on the complete_history
                tier (history present), never on the analysis tier. We never fake a
                timeline or claim a rollback check we didn't run. */}
            {history && analysis.mileageHistory.length ? (
              <Section title="Mileage" icon={VMileage} alert={analysis.rollbackDetected} premium>
                <StatRow
                  label="Rollback check"
                  value={
                    analysis.rollbackDetected
                      ? 'Discrepancy found'
                      : // Absence of records is not a clean bill — only assert
                        // "no issues" with enough readings to actually compare.
                        analysis.mileageHistory.length >= 2
                        ? 'No issues found'
                        : 'Not enough readings to check'
                  }
                  bad={analysis.rollbackDetected}
                />
                {/* Odometer-over-time chart (same as the web report) — a red
                    segment IS the rollback. Service readings dropped (dense
                    noise); title/registration/inspection readings + the most
                    recent reading keep the line legible. */}
                <MileageHistoryChart
                  history={analysis.mileageHistory}
                  rollback={analysis.rollbackDetected}
                  excludeService
                />
              </Section>
            ) : null}

            {/* The report's own findings — severity marks the DOT, not whole
                paragraphs; red text is reserved for Alert-level findings. */}
            {conditionFlags.length ? (
              <Section title="Report red flags" icon={VRedFlags} alert premium>
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
              <Section title="Ownership timeline" icon={VOwnership} premium>
                {history.ownerDetails.map((o) => {
                  const sub = [
                    o.lengthOfOwnership ? `owned ${o.lengthOfOwnership}` : null,
                    o.states?.length ? o.states.join(', ') : null,
                    o.lastReportedOdometer
                      ? `last reading ${o.lastReportedOdometer.toLocaleString()} mi`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <View key={`owner-${o.owner}`} style={[styles.recordRow, { borderColor: colors.border }]}>
                      <View style={styles.ownerRowTop}>
                        <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                          {`Owner ${o.owner ?? '?'}${o.purchasedYear ? ` · since ${o.purchasedYear}` : ''}${o.type ? ` · ${o.type}` : ''}`}
                        </Text>
                        <Text style={[styles.statValue, { color: colors.text }]}>
                          {o.events != null ? `${o.events} records` : '—'}
                        </Text>
                      </View>
                      {sub ? (
                        <Text style={[styles.ownerSub, { color: colors.textMuted }]}>{sub}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </Section>
            ) : null}

            {/* Empty sections shrink to one muted line — no empty cards. */}
            {history.auctionRecords.length ? (
              <Section title="Auction history" icon={VAuction} premium>
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

            {/* The DMV paper trail — title/registration/lien events, split out
                of the service timeline (they're paperwork, not maintenance). */}
            {history.adminRecords?.length ? (
              <CollapsibleSection
                title="Title, registration & liens"
                icon={VTitleRecords}
                summary={`${history.adminRecords.length} records`}
                alert={history.adminRecords.some((r) => r.lien)}
                premium
              >
                {history.adminRecords.map((r) => (
                  <RecordRow
                    key={r.date}
                    meta={`${r.date}${r.lien ? ' · Lien' : ''}`}
                    body={r.events.join(' · ')}
                  />
                ))}
              </CollapsibleSection>
            ) : null}

            {history.serviceHistory.length ? (
              <CollapsibleSection
                title="Service & inspections"
                icon={VMaintenance}
                summary={`${history.serviceHistory.length} records`}
                premium
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

        {/* v2.1 honesty split — the MODEL's track record as supporting
            context below the per-VIN block. On the analysis tier the Model
            Score is the headline at the top instead. */}
        {history && analysis.modelScore ? <ScoreBadge score={analysis.modelScore} label="Model Score" /> : null}

        {/* LEGACY pre-split Buyer reports stored valuation at this tier — old
            reports render whatever they paid for. New Buyer reports never
            compose these fields, so this block is absent for them. */}
        {!history && (analysis.estimatedValue || analysis.suggestedOffer || analysis.msrp) ? (
          <Section title="Value & pricing" icon={VValuePricing} premium>
            {analysis.estimatedValue ? (
              <StatRow
                label={
                  anchorMileage
                    ? `Value at ${anchorMileage.toLocaleString()} mi`
                    : 'Est. market value'
                }
                value={`$${analysis.estimatedValue.toLocaleString()}`}
              />
            ) : null}
            {analysis.valueLow && analysis.valueHigh ? (
              <StatRow
                label="Estimated range"
                value={`$${analysis.valueLow.toLocaleString()} – $${analysis.valueHigh.toLocaleString()}`}
              />
            ) : null}
            {analysis.msrp ? (
              <StatRow label="Original MSRP" value={`$${analysis.msrp.toLocaleString()}`} />
            ) : null}
            {analysis.depreciationPct != null ? (
              <StatRow label="Lost since new" value={`~${analysis.depreciationPct}%`} />
            ) : null}
            {analysis.suggestedOffer ? (
              <StatRow label="Suggested offer" value={`$${analysis.suggestedOffer.toLocaleString()}`} />
            ) : null}
            {analysis.negotiationAdvice ? (
              <Text style={[styles.cardBody, { color: colors.textMuted }]}>{analysis.negotiationAdvice}</Text>
            ) : null}
          </Section>
        ) : null}
        {!history ? valueCurveSection : null}

        {/* The deal — ONLY when a verdict actually exists. Without a market
            value there is nothing to grade (the Value section already says
            so), and without an asking price there is nothing to say. */}
        {deal?.verdict ? (
          <Section title="The deal" icon={VDeal} alert={deal.verdict === 'high'} premium>
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

        {/* Recent asking prices for comparable cars — REAL market evidence on
            BOTH tiers (raw observed asking prices, not our valuation).
            Accumulating pool:
            each point stamped with its seen date; older ones age out server-
            side at ~60 days. Vendor-neutral by design: the marketplace source
            is never named. Auctions and branded-title cars are filtered out
            server-side. */}
        {analysis.listingComps?.items.length ? (
          <Section title="Comparable listings" icon={VComparables}>
            <Text style={[styles.cardBody, { color: colors.textMuted, marginBottom: 8 }]}>
              {analysis.listingComps.count} recent asking{' '}
              {analysis.listingComps.count === 1 ? 'price' : 'prices'} for similar cars: $
              {analysis.listingComps.low.toLocaleString()}–$
              {analysis.listingComps.high.toLocaleString()} (average $
              {analysis.listingComps.average.toLocaleString()}).
              {analysis.listingComps.count > analysis.listingComps.items.length
                ? ` Newest ${analysis.listingComps.items.length} shown.`
                : ''}{' '}
              Asking prices, not sale prices — older listings may no longer be available.
            </Text>
            {analysis.listingComps.items.map((c, i) => (
              <StatRow
                key={`${i}-${c.price}`}
                label={[
                  c.mileage != null ? `${c.mileage.toLocaleString()} mi` : 'Mileage not listed',
                  c.titleStatus ? `${c.titleStatus} title` : null,
                  c.seenAt ? `seen ${shortDate(c.seenAt)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                value={`$${c.price.toLocaleString()}`}
              />
            ))}
          </Section>
        ) : null}

        {analysis.maintenanceOutlook ? (
          <Section title="Maintenance outlook" icon={VMaintenance}>
            <Text style={[styles.cardBody, { color: colors.text }]}>{analysis.maintenanceOutlook}</Text>
          </Section>
        ) : null}

        {/* Federal defect investigations — open ones always visible; the
            closed pile folds away behind a count. */}
        {analysis.investigations ? (
          <CollapsibleSection
            title="Investigations"
            icon={VInvestigationsOpen}
            alert={analysis.investigations.open > 0}
            summary={`${analysis.investigations.total} on file${analysis.investigations.open > 0 ? ` · ${analysis.investigations.open} open` : ''}`}
            defaultOpen={!history || analysis.investigations.open > 0}
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
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection
          title="Recalls & notices"
          icon={VRecallsNotices}
          alert={analysis.openRecalls.length > 0}
          summary={`${analysis.openRecalls.length} open`}
          defaultOpen={!history || analysis.openRecalls.length > 0}
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
                  meta={`${r.id}${r.component ? ` · ${recallComponentLabel(r.component)}` : ''}`}
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
          {analysis.openRecalls.length ? (
            <Text style={[styles.sourceNote, { color: colors.textMuted }]}>
              Safety recall repairs are free at the manufacturer’s dealerships.
            </Text>
          ) : null}
          <StatRow label="Manufacturer communications" value={String(analysis.manufacturerCommunications)} />
          {analysis.complaintTrends ? (
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>{analysis.complaintTrends}</Text>
          ) : null}
        </CollapsibleSection>

        {/* NHTSA crash-test ratings for this model, when on file. */}
        {analysis.safety ? (
          <CollapsibleSection
            title="Crash safety"
            icon={VCrashSafety}
            summary={`${Math.max(0, Math.min(5, analysis.safety.overall))}/5 overall`}
            defaultOpen
          >
            {(
              [
                ['Overall rating', analysis.safety.overall],
                ['Front crash', analysis.safety.front_crash],
                ['Side crash', analysis.safety.side_crash],
                ['Rollover', analysis.safety.rollover],
              ] satisfies [string, number | undefined][]
            )
              .filter((entry): entry is [string, number] => Boolean(entry[1]))
              .map(([label, score]) => {
                const s = Math.max(0, Math.min(5, Math.round(score)));
                return (
                  <StatRow key={label} label={label} value={`${'★'.repeat(s)}${'☆'.repeat(5 - s)}  ${s}/5`} />
                );
              })}
          </CollapsibleSection>
        ) : null}

        {/* Full spec sheet — identity detail, so it lives with the car. */}
        <SpecificationsSection vehicle={data.vehicle} />

        {/* EPA fuel economy — snake_case fields are contract-accurate. */}
        {analysis.fuelEconomy ? (
          <CollapsibleSection
            title="Fuel economy"
            icon={VFuelEconomy}
            summary={`${analysis.fuelEconomy.combined_mpg} ${analysis.fuelEconomy.electric_range ? 'MPGe' : 'MPG'} combined`}
            defaultOpen
          >
            <StatRow
              label="Combined"
              value={`${analysis.fuelEconomy.combined_mpg} ${analysis.fuelEconomy.electric_range ? 'MPGe' : 'MPG'}`}
            />
            {analysis.fuelEconomy.city_mpg && analysis.fuelEconomy.highway_mpg ? (
              <StatRow
                label="City / Highway"
                value={`${analysis.fuelEconomy.city_mpg} / ${analysis.fuelEconomy.highway_mpg} ${analysis.fuelEconomy.electric_range ? 'MPGe' : 'MPG'}`}
              />
            ) : null}
            {/* EV/PHEV context — electric range + Level 2 charge time (EPA). */}
            {analysis.fuelEconomy.electric_range ? (
              <StatRow
                label="Electric range"
                value={`${analysis.fuelEconomy.electric_range} mi`}
              />
            ) : null}
            {analysis.fuelEconomy.charge_time_240v ? (
              <StatRow
                label="Charge time (240V)"
                value={`~${analysis.fuelEconomy.charge_time_240v} hr`}
              />
            ) : null}
            {/* Driver-reported average vs the sticker — only sent with 3+ drivers. */}
            {analysis.fuelEconomy.real_world_mpg ? (
              <StatRow
                label={`Real-world (${analysis.fuelEconomy.real_world_sample} drivers)`}
                value={`${analysis.fuelEconomy.real_world_mpg} MPG`}
              />
            ) : null}
            {/* Prefer the cost at THIS week's pump price; EPA's static
                assumption is the fallback when the live price is off/down. */}
            {analysis.fuelEconomy.annual_fuel_cost_current ? (
              <>
                <StatRow
                  label={`Est. annual fuel cost (at $${analysis.fuelEconomy.gas_price_per_gallon?.toFixed(2)}/gal)`}
                  value={`$${analysis.fuelEconomy.annual_fuel_cost_current.toLocaleString()}`}
                />
                {/* EIA ToS asks for attribution when their data is displayed —
                    the agency name stays; no "Fuel price:" prefix. */}
                <Text style={[styles.sourceNote, { color: colors.textMuted }]}>
                  U.S. Energy Information Administration
                  {analysis.fuelEconomy.gas_price_as_of
                    ? `, week of ${shortDate(analysis.fuelEconomy.gas_price_as_of)}`
                    : ''}
                </Text>
              </>
            ) : analysis.fuelEconomy.annual_fuel_cost ? (
              <StatRow
                label="Est. annual fuel cost"
                value={`$${analysis.fuelEconomy.annual_fuel_cost.toLocaleString()}`}
              />
            ) : null}
            {analysis.fuelEconomy.co2_gpm ? (
              <StatRow label="CO₂ emissions" value={`${Math.round(analysis.fuelEconomy.co2_gpm)} g/mi`} />
            ) : null}
          </CollapsibleSection>
        ) : null}

        {/* Equipment is identity ("what this trim comes with"), so it lives
            with the car — collapsed to one row so the verdict stays on top. */}
        {analysis.factoryEquipment.length ? (
          <CollapsibleSection
            title="Factory equipment"
            icon={VFactoryEquipment}
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

        {/* EV/plug-in only: incentives + charging near the buyer's ZIP. */}
        {analysis.evOwnership ? (
          <CollapsibleSection
            title="EV ownership"
            icon={VEvOwnership}
            summary={
              analysis.evOwnership.charging
                ? `${analysis.evOwnership.charging.stationCount} chargers within ${analysis.evOwnership.charging.radiusMiles} mi`
                : `${analysis.evOwnership.incentives?.count ?? 0} incentives may apply`
            }
            defaultOpen={!history}
          >
            {analysis.evOwnership.charging ? (
              <StatRow
                label={`Public chargers within ${analysis.evOwnership.charging.radiusMiles} mi`}
                value={`${analysis.evOwnership.charging.stationCount} (${analysis.evOwnership.charging.dcFastCount} DC fast)`}
              />
            ) : null}
            {analysis.evOwnership.incentives ? (
              <>
                <StatRow
                  label="Incentives that may apply"
                  value={`${analysis.evOwnership.incentives.count}`}
                />
                {analysis.evOwnership.incentives.highlights.map((h) => (
                  <Text key={h.title} style={[styles.evIncentive, { color: colors.textMuted }]}>
                    •  {h.title}
                  </Text>
                ))}
                <Text style={[styles.evIncentive, { color: colors.textMuted }]}>
                  Eligibility depends on the buyer, the sale and the exact vehicle — verify
                  before counting on any credit.
                </Text>
              </>
            ) : null}
          </CollapsibleSection>
        ) : null}

        {/* The wrap-up — after all the evidence, not before it. */}
        <Section title="Our recommendation" icon={VRecommendation}>
          <Text style={[styles.cardBody, styles.reco, { color: colors.text }]}>
            {analysis.recommendation}
          </Text>
        </Section>

        {/* Tier-3 only: the per-VIN Buy Score lives in the premium block on
            complete_history; here it is honestly LOCKED — we haven't seen this
            VIN's records yet, and that's the upgrade. */}
        {!history ? (
          <View style={[styles.lockedCard, { backgroundColor: colors.surfaceAlt }]}>
            <View style={styles.lockedHeader}>
              <VLock size={18} color={colors.premium} />
              <Text style={[styles.lockedTitle, { color: colors.text }]}>
                {analysis.modelScore?.band === 'green'
                  ? 'Model checks out — now verify this exact car'
                  : 'Verify this exact car'}
              </Text>
            </View>
            <Text style={[styles.upsellText, { color: colors.textMuted }]}>
              This analysis hasn&apos;t seen this VIN&apos;s records. Unlock the Buy Score for this
              exact car, its market value with a suggested offer and negotiation advice, plus
              accident, title, theft, odometer, ownership, auction and service records.
            </Text>
            <PrimaryButton
              label={
                upgradeWithCredit
                  ? `${creditLabel(upgradeCreditCost)} — Premium Report`
                  : `Add Premium Report — +${formatUsd(PRICING.completeUpgrade)}`
              }
              onPress={() => navigation.navigate('PremiumUpsell', { vin, tier: 'complete_history' })}
              style={{ marginTop: 12 }}
            />
          </View>
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
  sectionTitle: { fontSize: 18, fontWeight: '800', flexShrink: 1 },
  collapseRight: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', flexShrink: 1 },
  collapseSummary: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  toggleRow: { paddingVertical: 12, alignItems: 'center' },
  toggleText: { fontSize: 14, fontWeight: '700' },
  recordRow: { paddingVertical: 10, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  evIncentive: { fontSize: 13.5, lineHeight: 19, paddingVertical: 4 },
  sourceNote: { fontSize: 12, lineHeight: 16, paddingTop: 6, paddingBottom: 2 },
  ocHeadline: { fontSize: 22, fontWeight: '800' },
  ocHeadlineSub: { fontSize: 13, fontWeight: '500' },
  ocBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 10, marginBottom: 4 },
  ocRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  ocDot: { width: 9, height: 9, borderRadius: 4.5 },
  upsellHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  upsellHintText: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
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
  highlightWrap: { marginTop: 2, paddingBottom: 6 },
  hbvEventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  hbvEventText: { fontSize: 14, flexShrink: 1 },
  ownerRowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  ownerSub: { fontSize: 12.5, lineHeight: 17 },
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
