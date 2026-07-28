import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleCheckBig } from 'lucide-react-native';
import { useTheme } from '../theme';
import VehicleHero from '../components/VehicleHero';
import SpecGrid, { type SpecEntry, type IconCmp } from '../components/SpecGrid';
import {
  VAssembledIn,
  VBodyStyle,
  VComplaints,
  VCrashes,
  VDoors,
  VDriveType,
  VEngine,
  VFuelEconomy,
  VFuelType,
  VHorsepower,
  VInvestigationsClear,
  VInvestigationsOpen,
  VManufacturer,
  VRecalls,
  VSafety,
  VSpecs,
} from '../components/vehifyIcons';
import PrimaryButton from '../components/PrimaryButton';
import LoadingOverlay from '../components/LoadingOverlay';
import { BUILDING_REPORT_MESSAGES, VIN_DECODE_MESSAGES } from '../config/loadingMessages';
import { track } from '../config/analytics';
import {
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
 * Specifications card — icon header + the shared SpecGrid. Short specs pair up
 * two-across; long values (fuel economy, place of assembly, manufacturer) get a
 * full-width row. Only specs the free decode returned are shown.
 */
function SpecsCard({ vehicle }: { vehicle: Vehicle }) {
  const { colors, radius } = useTheme();
  const raw: (SpecEntry | null)[] = [
    vehicle.bodyStyle ? { icon: VBodyStyle, label: 'Body style', value: vehicle.bodyStyle } : null,
    vehicle.doors ? { icon: VDoors, label: 'Doors', value: String(vehicle.doors) } : null,
    vehicle.engine ? { icon: VEngine, label: 'Engine', value: vehicle.engine } : null,
    vehicle.horsepower ? { icon: VHorsepower, label: 'Horsepower', value: `${vehicle.horsepower} hp` } : null,
    vehicle.driveType ? { icon: VDriveType, label: 'Drive type', value: vehicle.driveType } : null,
    vehicle.fuelType ? { icon: VFuelType, label: 'Fuel type', value: vehicle.fuelType } : null,
    vehicle.cityMpg && vehicle.highwayMpg
      ? { icon: VFuelEconomy, label: 'Fuel economy', value: `${vehicle.cityMpg} city / ${vehicle.highwayMpg} hwy MPG`, wide: true }
      : null,
    (() => {
      const place = [vehicle.plantCity, vehicle.plantCountry].filter(Boolean).join(', ');
      return place ? { icon: VAssembledIn, label: 'Assembled in', value: place, wide: true } : null;
    })(),
    vehicle.manufacturer ? { icon: VManufacturer, label: 'Manufacturer', value: vehicle.manufacturer, wide: true } : null,
  ];
  const entries = raw.filter((e): e is SpecEntry => e !== null);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
      <View style={styles.cardHeader}>
        <VSpecs size={20} color={colors.primary} />
        <Text style={[styles.cardHeaderText, { color: colors.text }]}>Specifications</Text>
      </View>
      <SpecGrid entries={entries} />
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
function SafetyOverview({ counts, model }: { counts: SafetyCounts; model: string }) {
  const { colors, radius } = useTheme();
  const openInv = counts.openInvestigations;
  const tones: Record<Tone, string> = { info: colors.primary, warn: colors.warning, good: colors.success };
  const tiles: { icon: IconCmp; value: number; label: string; tone: Tone }[] = [
    { icon: VComplaints, value: counts.complaints, tone: 'info', label: 'complaints' },
    { icon: VCrashes, value: counts.crashes, tone: 'info', label: counts.crashes === 1 ? 'crash' : 'crashes' },
    {
      icon: VRecalls,
      value: counts.recalls,
      tone: counts.recalls > 0 ? 'warn' : 'good',
      label: counts.recalls === 1 ? 'open recall' : 'open recalls',
    },
    {
      icon: openInv > 0 ? VInvestigationsOpen : VInvestigationsClear,
      value: counts.investigations,
      tone: openInv > 0 ? 'warn' : 'good',
      label: counts.investigations === 1 ? 'investigation' : 'investigations',
    },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
      <View style={styles.cardHeader}>
        <VSafety size={20} color={colors.primary} />
        <Text style={[styles.cardHeaderText, { color: colors.text }]}>Safety overview</Text>
      </View>
      {/* Model-level NHTSA totals — the YMM framing tells the buyer these are
          across the model, not this specific VIN. */}
      <Text style={[styles.cardSub, { color: colors.textMuted }]}>
        Across all {model} vehicles
      </Text>
      <View style={styles.riskRow}>
        {tiles.map((t) => {
          const fg = tones[t.tone];
          return (
            <View key={t.label} style={[styles.riskTile, { backgroundColor: `${fg}14`, borderRadius: radius.md }]}>
              <t.icon size={22} color={fg} />
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
        <VehicleHero vehicle={data.vehicle} plate={displayedPlate} badge="Basic report" />

        {/* Specs returned by the free decode — year/make/model/trim already live
            in the hero title, so only NEW information appears here. */}
        <SpecsCard vehicle={data.vehicle} />

        {/* Free safety overview — headline counts only, primes the upsell below.
            Hidden on older backends that don't return the counts. */}
        {data.safetyCounts ? (
          <SafetyOverview
            counts={data.safetyCounts}
            model={[data.vehicle.year, data.vehicle.make, data.vehicle.model].filter(Boolean).join(' ')}
          />
        ) : null}

        {/* Every explicit scan starts a new report chain, even when this VIN
            was checked before. Older reports remain available in History. */}
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
                { label: 'Estimated value by year and mileage', starred: true },
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

        {displayedPlate ? (
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
  // Cards (specs + safety)
  card: { borderWidth: 1, paddingHorizontal: 16, paddingBottom: 8, paddingTop: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardHeaderText: { fontSize: 17, fontWeight: '800' },
  cardSub: { fontSize: 12.5, lineHeight: 17, marginBottom: 10, marginTop: -2 },
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
