import React, { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, ChevronDown, HelpCircle, Pencil, X } from 'lucide-react-native';
import { useTheme } from '../theme';
import PrimaryButton from '../components/PrimaryButton';
import StatePickerModal from '../components/StatePickerModal';
import { FRAME_DIMS } from '../components/ScannerFrame';
import { discardShot } from '../ml/plateProcessor';
import { useGetPlateQuotaQuery } from '../services/api';
import { US_STATES, normalizePlate } from '../utils/plate';
import { normalizeVin, validateVin } from '../utils/vin';
import { track } from '../config/analytics';
import type { StackScreenProps } from '../types/navigation';

type Props = StackScreenProps<'ScanReview'>;

type Mode = 'plate' | 'vin';

/**
 * The one confirm/entry page for the scan flow. Reached three ways:
 *  - a plate/VIN capture with a read (confident or weak),
 *  - a capture that read nothing, or
 *  - "Can't scan? Type instead" (manual).
 * Editable, with a Plate | VIN toggle, and it owns the actual lookups.
 */
export default function ScanReviewScreen({ navigation, route }: Props) {
  const { colors, radius, spacing } = useTheme();
  const p = route.params;

  const [mode, setMode] = useState<Mode>(p.mode);
  const [plate, setPlate] = useState(p.plate ?? '');
  const [state, setState] = useState(p.state ?? '');
  const [vin, setVin] = useState(p.vin ?? '');
  const [error, setError] = useState<string | undefined>();
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Remaining free plate lookups (plate mode only) — for the transparency line.
  // Refetch on every open so it reflects the current sign-in state and usage
  // (a cached anonymous result would otherwise linger after logging in).
  const { data: quota } = useGetPlateQuotaQuery(undefined, {
    skip: mode !== 'plate',
    refetchOnMountOrArgChange: true,
  });

  // The captured image is handed off from the scanner — this screen owns its
  // deletion once we leave (whichever way).
  useEffect(() => {
    return () => discardShot(p.imageUri);
  }, [p.imageUri]);

  const stateName = US_STATES.find((s) => s.code === state)?.name;
  const clearError = () => setError(undefined);
  const label = mode === 'plate' ? 'plate' : 'VIN';
  const hasValue = mode === 'plate' ? plate.trim().length > 0 : vin.trim().length > 0;

  // At/above this the read is trusted (matches the mixed-plate vote floor).
  const CONFIDENT_AT = 70;

  // The capture data only applies to the mode that was captured. Toggling to
  // the OTHER mode (e.g. captured a plate, switched to VIN) is plain entry — we
  // never scanned a VIN, so don't claim we "couldn't read" it.
  const capturedThisMode = !p.manual && mode === p.mode;

  // Read quality → the review state:
  //  manual        → plain instruction
  //  nothing read  → prominent "couldn't read, type it" card
  //  low confidence→ prominent "double-check / X%" card, value pre-filled
  //  confident     → calm confirm line
  const status: 'manual' | 'none' | 'low' | 'ok' = !capturedThisMode
    ? 'manual'
    : !hasValue || p.confidence === undefined
      ? 'none'
      : p.confidence < CONFIDENT_AT
        ? 'low'
        : 'ok';

  const searchPlate = () => {
    const norm = normalizePlate(plate);
    if (norm.length < 2 || norm.length > 8) return setError('Enter a valid plate number.');
    if (!state) return setError('Select the plate’s state.');
    track(p.manual ? 'manual_plate_entered' : 'scan_confirmed', { state });
    navigation.navigate('VehicleMatch', { plate: norm, state });
  };

  const searchVin = () => {
    const check = validateVin(vin);
    if (!check.valid) return setError(check.error);
    track(p.manual ? 'manual_vin_entered' : 'scan_confirmed');
    navigation.navigate('BasicResult', { vin: normalizeVin(vin), lookup: true });
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    clearError();
  };

  const tabStyle = (active: boolean) => [
    styles.tab,
    { backgroundColor: active ? colors.primary : colors.surfaceAlt, borderRadius: radius.sm },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {p.imageUri ? (
            <View style={styles.shotGroup}>
              {/* The iOS corner detector draws its chosen quadrilateral directly
                  on this preview; the clean perspective crop is used only by OCR. */}
              <View
                style={[
                  styles.shotWrap,
                  { borderColor: colors.border, borderRadius: radius.md, aspectRatio: FRAME_DIMS[p.mode].w / FRAME_DIMS[p.mode].h },
                ]}
              >
                <Image source={{ uri: p.imageUri }} style={styles.shot} resizeMode="cover" />
              </View>
              {p.mode === 'plate' && p.plateDetected ? (
                <Text style={[styles.detectionCaption, { color: colors.textMuted }]}>
                  Green highlight = detected plate area
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Plate | VIN toggle — switch if we read the wrong type, or for manual entry. */}
          <View style={styles.tabs}>
            <Pressable accessibilityRole="button" accessibilityLabel="Plate" onPress={() => switchMode('plate')} style={tabStyle(mode === 'plate')}>
              <Text style={[styles.tabText, { color: mode === 'plate' ? colors.onPrimary : colors.text }]}>Plate</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="VIN" onPress={() => switchMode('vin')} style={tabStyle(mode === 'vin')}>
              <Text style={[styles.tabText, { color: mode === 'vin' ? colors.onPrimary : colors.text }]}>VIN</Text>
            </Pressable>
          </View>

          {status === 'ok' ? (
            <Text style={[styles.banner, { color: colors.textMuted }]}>
              Is this the {label} you scanned? Edit if it’s off.
            </Text>
          ) : status === 'manual' ? (
            <Text style={[styles.banner, { color: colors.textMuted }]}>Enter a license plate or a VIN.</Text>
          ) : (
            // Prominent card for a miss or a shaky read — not a muted line.
            <View style={[styles.warnCard, { backgroundColor: `${colors.warning}18`, borderColor: colors.warning, borderRadius: radius.md }]}>
              <AlertTriangle size={20} color={colors.warning} strokeWidth={2.5} />
              <View style={styles.flex}>
                <Text style={[styles.warnTitle, { color: colors.text }]}>
                  {status === 'none' ? `We couldn’t read the ${label}` : `Low confidence${p.confidence != null ? ` — ${p.confidence}% sure` : ''}`}
                </Text>
                <Text style={[styles.warnBody, { color: colors.textMuted }]}>
                  {status === 'none'
                    ? `Type it below${p.imageUri ? ' — read it off the photo above' : ''}, or capture again.`
                    : `Double-check every character${p.imageUri ? ' against the photo' : ''} before searching.`}
                </Text>
              </View>
            </View>
          )}

          {mode === 'plate' ? (
            <>
              <View style={[styles.plateBox, { borderColor: colors.border, borderRadius: radius.md }]}>
                <TextInput
                  value={plate}
                  onChangeText={(t) => { setPlate(t.toUpperCase().replace(/[^A-Z0-9 -]/gi, '')); clearError(); }}
                  placeholder="ABC 1234"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                  style={[styles.plateInput, { color: colors.text }]}
                />
                <Pencil size={18} color={colors.textMuted} strokeWidth={2.25} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select state"
                onPress={() => setStatePickerOpen(true)}
                style={[styles.stateSelect, { borderColor: colors.border, borderRadius: radius.md }]}
              >
                <Text style={{ color: stateName ? colors.text : colors.textMuted, fontSize: 16 }}>
                  {stateName ?? 'Select state (required)'}
                </Text>
                <ChevronDown size={18} color={colors.textMuted} strokeWidth={2.25} />
              </Pressable>
            </>
          ) : (
            <TextInput
              value={vin}
              onChangeText={(t) => { setVin(t.toUpperCase()); clearError(); }}
              placeholder="17-character VIN"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={17}
              style={[styles.vinInput, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
            />
          )}

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          {mode === 'plate' ? (
            // Transparency: free plate lookups are limited (each one costs us a
            // provider call). The (?) opens the full explanation.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="How free plate lookups work"
              onPress={() => setInfoOpen(true)}
              style={styles.quotaRow}
              hitSlop={8}
            >
              <Text style={[styles.note, { color: colors.textMuted }]}>
                {quota
                  ? `${quota.remaining} free plate look${quota.remaining === 1 ? 'up' : 'ups'} left${quota.signedIn ? '' : ' — sign in for more'}`
                  : 'Plate lookups are free (a daily limit applies).'}
              </Text>
              <HelpCircle size={16} color={colors.textMuted} strokeWidth={2.25} />
            </Pressable>
          ) : (
            <Text style={[styles.note, { color: colors.textMuted }]}>
              A VIN is the exact car — no state needed, and VIN lookups are always free.
            </Text>
          )}

          <PrimaryButton
            label={mode === 'plate' ? 'Find this vehicle' : 'Look up VIN'}
            onPress={mode === 'plate' ? searchPlate : searchVin}
            style={{ marginTop: spacing.md }}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <StatePickerModal
        visible={statePickerOpen}
        onClose={() => setStatePickerOpen(false)}
        onSelect={(code) => { setState(code); setStatePickerOpen(false); clearError(); }}
      />

      {/* How free plate lookups work — transparency about the real cost. */}
      <Modal visible={infoOpen} transparent animationType="fade" onRequestClose={() => setInfoOpen(false)}>
        <Pressable style={[styles.infoBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setInfoOpen(false)} />
        <View style={styles.infoCenter} pointerEvents="box-none">
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radius.xl }]}>
            <View style={styles.infoHeader}>
              <Text style={[styles.infoTitle, { color: colors.text }]}>Why plate lookups are limited</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setInfoOpen(false)} hitSlop={10}>
                <X size={20} color={colors.textMuted} strokeWidth={2.5} />
              </Pressable>
            </View>
            <Text style={[styles.infoBody, { color: colors.textMuted }]}>
              Turning a license plate into a VIN isn&apos;t free for us — every lookup is a
              paid request to a vehicle-data provider. We cover that cost so you can check a
              car for free, but to keep it sustainable each account gets a set number of free
              plate lookups a day.
              {'\n\n'}
              Looking a car up by its VIN is always free and unlimited — it never counts
              against this limit. Signing in also raises your daily allowance.
            </Text>
            <PrimaryButton label="Got it" onPress={() => setInfoOpen(false)} style={{ marginTop: spacing.md }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 20, gap: 14 },
  shotGroup: { gap: 6 },
  shotWrap: { width: '100%', borderWidth: 1, overflow: 'hidden', backgroundColor: '#0000000a' },
  shot: { width: '100%', height: '100%' },
  detectionCaption: { fontSize: 12, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 8 },
  warnCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, padding: 14 },
  warnTitle: { fontSize: 15, fontWeight: '700' },
  warnBody: { fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '700' },
  banner: { fontSize: 15, lineHeight: 21 },
  quotaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoBackdrop: { flex: 1 },
  infoCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  infoCard: { width: '100%', maxWidth: 420, padding: 20 },
  infoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  infoTitle: { fontSize: 18, fontWeight: '800', flexShrink: 1 },
  infoBody: { fontSize: 14, lineHeight: 20, marginTop: 12 },
  plateBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 14 },
  plateInput: { flex: 1, fontSize: 26, fontWeight: '800', letterSpacing: 4, paddingVertical: 12 },
  stateSelect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, paddingHorizontal: 14, paddingVertical: 15 },
  vinInput: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 15, fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  error: { fontSize: 14 },
  note: { fontSize: 13, lineHeight: 18 },
});
