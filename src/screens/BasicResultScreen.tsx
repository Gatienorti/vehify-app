import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CarFront,
  CircleCheckBig,
  Cog,
  Factory,
  FileText,
  Fuel,
  Gauge,
  MapPin,
  MessageSquare,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Siren,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { vehicleTitle } from '../components/VehicleCard';
import CarDoorIcon from '../components/CarDoorIcon';
import PrimaryButton from '../components/PrimaryButton';
import LoadingOverlay from '../components/LoadingOverlay';
import { BUILDING_REPORT_MESSAGES, VIN_DECODE_MESSAGES } from '../config/loadingMessages';
import { track } from '../config/analytics';
import {
  useGetPurchasesQuery,
  useGetVehicleBasicQuery,
  useLookupVinMutation,
} from '../services/api';
import { useRecordLookup } from '../hooks/useRecordLookup';
import { useCredits } from '../hooks/useCredits';
import { useCreditHeaderButton } from '../components/CreditBadge';
import { PurchaseCancelledError, usePurchaseReport } from '../hooks/usePurchaseReport';
import { PRICING, creditCostFor, creditLabel, formatUsd } from '../config/pricing';
import type { StackScreenProps } from '../types/navigation';
import type { SafetyCounts, Vehicle } from '../types/vehicle';

type Props = StackScreenProps<'BasicResult'>;

/**
 * Hero card — vehicle identity. Photo is OPTIONAL: when `imageUrl` is present it
 * lays out photo-left / text-right; with no image (the free tier today has none)
 * it falls back to a clean text-only hero. A soft brand-tinted gradient sets it
 * apart from the white cards below.
 */
function Hero({
  vehicle,
  plate,
  imageUrl,
}: {
  vehicle: Vehicle;
  plate?: { plate: string; state?: string };
  imageUrl?: string;
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
          <Text style={[styles.heroBadgeText, { color: colors.primary }]}>Basic report</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

/** Any lucide icon OR our custom car-door icon (same size/color/stroke props). */
type IconCmp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/**
 * One spec: icon on the left, label stacked over value. Stacking (not label ·
 * value side-by-side) so a long value never squeezes the label into "Horsepo…".
 */
function SpecCell({ icon: Icon, label, value }: { icon: IconCmp; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.specCell}>
      <Icon size={18} color={colors.textMuted} strokeWidth={2} />
      <View style={styles.specTextCol}>
        <Text style={[styles.specLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.specValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

type SpecEntry = { icon: IconCmp; label: string; value: string; wide?: boolean };

/**
 * Specifications card — icon header + iconographic rows. Short specs pair up
 * two-across; long values (fuel economy, place of assembly, manufacturer) get a
 * full-width row. Only specs the free decode returned are shown.
 */
function SpecsCard({ vehicle }: { vehicle: Vehicle }) {
  const { colors, radius } = useTheme();
  const raw: (SpecEntry | null)[] = [
    vehicle.bodyStyle ? { icon: CarFront, label: 'Body style', value: vehicle.bodyStyle } : null,
    // Custom car-door glyph — lucide only has house doors.
    vehicle.doors ? { icon: CarDoorIcon, label: 'Doors', value: String(vehicle.doors) } : null,
    vehicle.engine ? { icon: Cog, label: 'Engine', value: vehicle.engine } : null,
    vehicle.horsepower ? { icon: Gauge, label: 'Horsepower', value: `${vehicle.horsepower} hp` } : null,
    vehicle.driveType ? { icon: Settings, label: 'Drive type', value: vehicle.driveType } : null,
    vehicle.fuelType ? { icon: Fuel, label: 'Fuel type', value: vehicle.fuelType } : null,
    vehicle.cityMpg && vehicle.highwayMpg
      ? { icon: Gauge, label: 'Fuel economy', value: `${vehicle.cityMpg} city / ${vehicle.highwayMpg} hwy MPG`, wide: true }
      : null,
    (() => {
      const place = [vehicle.plantCity, vehicle.plantCountry].filter(Boolean).join(', ');
      return place ? { icon: MapPin, label: 'Assembled in', value: place, wide: true } : null;
    })(),
    vehicle.manufacturer ? { icon: Factory, label: 'Manufacturer', value: vehicle.manufacturer, wide: true } : null,
  ];
  const entries = raw.filter((e): e is SpecEntry => e !== null);
  const compact = entries.filter((e) => !e.wide);
  const wide = entries.filter((e) => e.wide);
  // Pair compact specs two-across.
  const pairs: SpecEntry[][] = [];
  for (let i = 0; i < compact.length; i += 2) pairs.push(compact.slice(i, i + 2));

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
      <View style={styles.cardHeader}>
        <FileText size={20} color={colors.primary} strokeWidth={2.2} />
        <Text style={[styles.cardHeaderText, { color: colors.text }]}>Specifications</Text>
      </View>
      {pairs.map((pair, i) => (
        <View key={`p${i}`} style={[styles.specRow, { borderColor: colors.border }]}>
          <SpecCell {...pair[0]} />
          <View style={[styles.specDivider, { backgroundColor: colors.border }]} />
          {pair[1] ? <SpecCell {...pair[1]} /> : <View style={styles.specCell} />}
        </View>
      ))}
      {wide.map((e) => (
        <View key={e.label} style={[styles.specRow, { borderColor: colors.border }]}>
          <SpecCell {...e} />
        </View>
      ))}
    </View>
  );
}

type Tone = 'info' | 'warn' | 'good';

/**
 * Safety overview: four headline counts (complaints, crashes, open recalls,
 * federal investigations) as tinted tiles. Counts ONLY — a hook into the paid
 * Buyer Report, which explains what they mean. Honest by tone: complaints +
 * crashes are informational (blue); open recalls and open investigations flag a
 * calm amber (never "danger" — CLAUDE.md copy rule); a clean zero reads green.
 */
function SafetyOverview({ counts }: { counts: SafetyCounts }) {
  const { colors, radius } = useTheme();
  const openInv = counts.openInvestigations;
  const tones: Record<Tone, string> = { info: colors.primary, warn: colors.warning, good: colors.success };
  const tiles: { icon: LucideIcon; value: number; label: string; tone: Tone }[] = [
    { icon: MessageSquare, value: counts.complaints, tone: 'info', label: 'complaints' },
    { icon: Siren, value: counts.crashes, tone: 'info', label: counts.crashes === 1 ? 'crash reported' : 'crashes reported' },
    {
      icon: TriangleAlert,
      value: counts.recalls,
      tone: counts.recalls > 0 ? 'warn' : 'good',
      label: counts.recalls === 1 ? 'open recall' : 'open recalls',
    },
    {
      icon: openInv > 0 ? ShieldAlert : ShieldCheck,
      value: counts.investigations,
      tone: openInv > 0 ? 'warn' : 'good',
      label: counts.investigations === 1 ? 'investigation' : 'investigations',
    },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
      <View style={styles.cardHeader}>
        <ShieldCheck size={20} color={colors.primary} strokeWidth={2.2} />
        <Text style={[styles.cardHeaderText, { color: colors.text }]}>Safety overview</Text>
      </View>
      <View style={styles.riskRow}>
        {tiles.map((t) => {
          const fg = tones[t.tone];
          return (
            <View key={t.label} style={[styles.riskTile, { backgroundColor: `${fg}14`, borderRadius: radius.md }]}>
              <t.icon size={20} color={fg} strokeWidth={2.2} />
              <Text style={[styles.riskValue, { color: fg }]}>{t.value}</Text>
              <Text style={[styles.riskLabel, { color: colors.textMuted }]}>{t.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Free basic result (spec §11). */
export default function BasicResultScreen({ navigation, route }: Props) {
  const { colors, spacing, radius } = useTheme();
  useCreditHeaderButton();
  const { vin, lookup, plateMatch } = route.params;
  // Fresh from scan/manual entry (`lookup`): decode the VIN HERE — the scan
  // flow navigates immediately so the loading state lives on this screen
  // instead of a sheet that collapses mid-transition. `decoded` gates the
  // basic query: /vehicle/:vin/basic serves what the decode just cached.
  const [lookupVin] = useLookupVinMutation();
  const recordLookup = useRecordLookup();
  const [decoded, setDecoded] = useState(!lookup);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const runDecode = useCallback(async () => {
    setDecodeFailed(false);
    try {
      const res = await lookupVin({ vin }).unwrap();
      recordLookup(res.vehicle, { lookupType: 'vin' });
      setDecoded(true);
    } catch {
      setDecodeFailed(true);
    }
  }, [lookupVin, recordLookup, vin]);
  const decodeStartedRef = useRef(false);
  useEffect(() => {
    if (!lookup || decodeStartedRef.current) return;
    decodeStartedRef.current = true;
    void runDecode();
  }, [lookup, runDecode]);

  const { data, isLoading, isError, refetch } = useGetVehicleBasicQuery(vin, { skip: !decoded });
  // Ownership comes from the SERVER (device_id / user_id), never a local cache
  // that can claim a report the backend no longer has.
  const { data: purchases } = useGetPurchasesQuery();
  const purchase = purchases?.find((r) => r.vin === vin && r.reportId);
  const { buy, redeem, buying } = usePurchaseReport();
  // Credits-first: if the buyer holds enough credits, spend them instead of an
  // in-app purchase. Not enough (incl. zero) → the $ path, with no credit
  // mention at all (App Store rules + keeps the funnel clean).
  const { balance } = useCredits();
  const buyerCreditCost = creditCostFor('buyers_analysis');
  const useCredit = balance >= buyerCreditCost;

  const goToVinEntry = () => {
    track('vehicle_rejected');
    navigation.navigate('ScanReview', { mode: 'vin', manual: true });
  };

  // Fresh from scan + report already owned → straight to it; this page would
  // only offer "View your report" anyway. (Only on the `lookup` arrival —
  // a deliberate visit to Basic from elsewhere stays put.)
  const ownedReportId = lookup && purchase ? purchase.reportId : null;
  const ownedTier = purchase?.tier;
  useEffect(() => {
    if (!decoded || !ownedReportId || !ownedTier) return;
    navigation.replace('PremiumReport', { vin, reportId: ownedReportId, tier: ownedTier });
  }, [decoded, ownedReportId, ownedTier, navigation, vin]);

  useEffect(() => {
    track('basic_report_viewed', { vin });
  }, [vin]);

  // Purchase runs right here — one tap, no input sheet (the odometer/asking
  // price fields died with the valuation move: the Buyer Report is
  // valuation-free, and Premium prices from the history odometer). Success
  // rebuilds the stack as Tabs → Report so back lands on Scan.
  const buyAnalysis = async () => {
    try {
      const confirm = useCredit
        ? await redeem(vin, 'buyers_analysis')
        : await buy(vin, 'buyers_analysis');
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          { name: 'PremiumReport', params: { vin, reportId: confirm.reportId, tier: confirm.tier } },
        ],
      });
    } catch (e) {
      if (e instanceof PurchaseCancelledError) return; // closed the sheet — silence
      Alert.alert(
        useCredit ? 'Couldn’t use your credit' : 'Purchase didn’t complete',
        useCredit
          ? 'Your credit wasn’t spent. Check your connection and try again.'
          : 'You haven’t been charged twice — a paid purchase is resumed on retry.',
        [
          { text: 'Try again', onPress: () => void buyAnalysis() },
          { text: 'Not now', style: 'cancel' },
        ],
      );
    }
  };

  if (isError || decodeFailed) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Couldn&apos;t load this vehicle</Text>
        <Text style={[styles.errorBody, { color: colors.textMuted }]}>
          Check your connection and try again.
        </Text>
        <PrimaryButton
          label="Try again"
          onPress={() => (decodeFailed ? void runDecode() : void refetch())}
          style={{ marginTop: 16, alignSelf: 'stretch', marginHorizontal: 24 }}
        />
      </SafeAreaView>
    );
  }

  if (!decoded) {
    // Decoding a freshly scanned/typed VIN — same overlay the confirm sheet
    // used, so the transition reads as one continuous loading state.
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <LoadingOverlay visible title="Decoding this VIN…" messages={VIN_DECODE_MESSAGES} dim={false} />
      </SafeAreaView>
    );
  }

  if (isLoading || !data) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // A fresh plate route can paint immediately; otherwise the backend returns
  // the buyer-scoped plate/state directly on the Vehicle contract.
  const displayedPlate = plateMatch
    ? { plate: plateMatch.plate, state: plateMatch.state }
    : data.vehicle.plate
      ? { plate: data.vehicle.plate, state: data.vehicle.state ?? undefined }
      : undefined;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {/* Hero identity — photo optional (free tier has none today → text hero). */}
        <Hero vehicle={data.vehicle} plate={displayedPlate} />

        {/* Specs returned by the free decode — year/make/model/trim already live
            in the hero title, so only NEW information appears here. */}
        <SpecsCard vehicle={data.vehicle} />

        {/* Free safety overview — headline counts only, primes the upsell below.
            Hidden on older backends that don't return the counts. */}
        {data.safetyCounts ? <SafetyOverview counts={data.safetyCounts} /> : null}

        {purchase ? (
          /* Report already purchased — never re-sell a non-consumable.
             replace (not navigate): back from the report should skip this
             screen and land on Scan. */
          <PrimaryButton
            label="View your report"
            onPress={() =>
              navigation.replace('PremiumReport', {
                vin,
                reportId: purchase.reportId,
                tier: purchase.tier,
              })
            }
          />
        ) : (
          /* Upsell to Buyer's Analysis — the funnel's money moment, sold as a
             proper offer card, not a gray paragraph. Honesty: the Buyer
             Report judges the MODEL (score, recalls, safety, upkeep);
             valuation and the per-VIN Buy Score are the Premium promise,
             never implied here. */
          <View
            style={[
              styles.upsell,
              {
                backgroundColor: colors.surface,
                borderColor: colors.primary,
                borderRadius: radius.lg,
              },
            ]}
          >
            <Text style={[styles.upsellTitle, { color: colors.text }]}>
              Should you buy this car?
            </Text>
            {(
              [
                { label: 'Model Score — real complaints, recalls & federal investigations' },
                { label: 'Crash ratings, fuel costs & open recalls', starred: true },
                { label: 'Recent comparable listings', starred: true },
                { label: 'Maintenance outlook & plain-English recommendation' },
              ] as { label: string; starred?: boolean }[]
            ).map((line) => (
              <View key={line.label} style={styles.featureRow}>
                <CircleCheckBig size={18} color={colors.success} strokeWidth={2.5} />
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {line.label}
                  {line.starred ? <Text style={{ color: colors.textMuted }}>*</Text> : null}
                </Text>
              </View>
            ))}
            <Text style={[styles.hedge, { color: colors.textMuted }]}>
              *When available for your vehicle — data coverage varies by age and model.
            </Text>
            <PrimaryButton
              label={
                useCredit
                  ? `${creditLabel(buyerCreditCost)} — Buyer Report`
                  : `Get Buyer Report — ${formatUsd(PRICING.buyersAnalysis)}`
              }
              onPress={() => {
                track('premium_cta_viewed', { vin, tier: 'buyers_analysis' });
                void buyAnalysis();
              }}
              style={{ marginTop: 6 }}
            />
          </View>
        )}

        {displayedPlate && !purchase ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Not the right car? Enter the VIN"
            onPress={goToVinEntry}
            hitSlop={8}
            style={({ pressed }) => [styles.vinCorrection, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Text style={[styles.vinCorrectionText, { color: colors.textMuted }]}>
              Not the right car?{' '}
              <Text style={[styles.vinCorrectionLink, { color: colors.primary }]}>
                Enter the VIN
              </Text>
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Credit redeems have no store sheet — show progress while the
          backend builds; store purchases surface RevenueCat's own UI. */}
      <LoadingOverlay visible={buying} title="Building your analysis…" messages={BUILDING_REPORT_MESSAGES} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  vinCorrection: { alignItems: 'center', paddingVertical: 8 },
  vinCorrectionText: { fontSize: 14, textAlign: 'center' },
  vinCorrectionLink: { fontWeight: '700', textDecorationLine: 'underline' },
  // Hero
  hero: { borderWidth: 1, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroImage: { width: 108, height: 84 },
  heroText: { flex: 1, gap: 4 },
  heroTitle: { fontSize: 22, fontWeight: '800', lineHeight: 27 },
  heroVin: { fontSize: 13.5 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, marginTop: 6 },
  heroBadgeText: { fontSize: 13, fontWeight: '700' },
  // Cards (specs + safety)
  card: { borderWidth: 1, paddingHorizontal: 16, paddingBottom: 8, paddingTop: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardHeaderText: { fontSize: 17, fontWeight: '800' },
  // Specs
  specRow: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
  specCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  specTextCol: { flex: 1, gap: 1 },
  specDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: 10 },
  specLabel: { fontSize: 12.5, fontWeight: '500' },
  specValue: { fontSize: 14.5, fontWeight: '700' },
  // Safety tiles
  // Negative margin reclaims most of the card's 16px horizontal padding so the
  // four tiles get the full card width (the specs card keeps its padding).
  riskRow: { flexDirection: 'row', gap: 5, paddingTop: 6, paddingBottom: 8, marginHorizontal: -10 },
  riskTile: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 14, paddingHorizontal: 0 },
  riskValue: { fontSize: 23, fontWeight: '800' },
  riskLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 14 },
  upsell: { padding: 16, borderWidth: 1.5, gap: 10 },
  upsellTitle: { fontSize: 18, fontWeight: '800' },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  featureText: { fontSize: 14.5, lineHeight: 20, flex: 1 },
  hedge: { fontSize: 12, fontWeight: '500' },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  errorBody: { fontSize: 14, marginTop: 6 },
});
