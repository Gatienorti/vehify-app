import React, { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChevronDown, Pencil } from 'lucide-react-native';
import { useTheme } from '../theme';
import PrimaryButton from './PrimaryButton';
import LoadingOverlay from './LoadingOverlay';
import { US_STATES, normalizePlate } from '../utils/plate';
import { PLATE_LOOKUP_MESSAGES } from '../config/loadingMessages';

interface Props {
  visible: boolean;
  /** Plate as detected by the scanner (or typed manually). */
  initialPlate: string;
  /** Detected state code, or null if the scanner couldn't tell. */
  initialState: string | null;
  submitting?: boolean;
  /** Server/network failure from the lookup itself (validation errors are local). */
  serverError?: string | null;
  onCancel: () => void;
  onConfirm: (plate: string, state: string) => void;
}

/**
 * Confirmation sheet for a plate lookup: the read is editable (both plate and
 * state) before the user commits to the $0.25 charge.
 */
export default function ScanConfirmSheet({
  visible,
  initialPlate,
  initialState,
  submitting = false,
  serverError = null,
  onCancel,
  onConfirm,
}: Props) {
  const { colors, radius, spacing } = useTheme();
  const [plate, setPlate] = useState(initialPlate);
  const [state, setState] = useState(initialState ?? '');
  const [error, setError] = useState<string | undefined>();
  const [statePickerOpen, setStatePickerOpen] = useState(false);

  // Re-seed the fields each time the sheet opens with a fresh detection
  // (render-time state adjustment — avoids a one-frame flash of stale values).
  const seedKey = visible ? `${initialPlate}|${initialState ?? ''}` : null;
  const [prevSeedKey, setPrevSeedKey] = useState<string | null>(null);
  if (seedKey !== prevSeedKey) {
    setPrevSeedKey(seedKey);
    if (seedKey !== null) {
      setPlate(initialPlate);
      setState(initialState ?? '');
      setError(undefined);
      setStatePickerOpen(false);
    }
  }

  const stateName = US_STATES.find((s) => s.code === state)?.name;

  const confirm = () => {
    const p = normalizePlate(plate);
    if (p.length < 2 || p.length > 8) {
      setError('Enter a valid plate number.');
      return;
    }
    if (!state) {
      setError('Select the plate’s state.');
      return;
    }
    onConfirm(p, state);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      {/* Transparent backdrop (still tap-to-cancel): the scanner behind is
          showing the frozen detection shot — it must read clean, not dimmed. */}
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.avoider}
        pointerEvents="box-none"
      >
      <View style={[styles.sheet, { backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
        <View style={styles.grabber} />
        <Text style={[styles.title, { color: colors.text }]}>Confirm the plate</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Confirm the plate and state before searching.
        </Text>

        <View style={[styles.plateBox, { borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.md }]}>
          <TextInput
            value={plate}
            onChangeText={(t) => { setPlate(t.toUpperCase().replace(/[^A-Z0-9 -]/gi, '')); setError(undefined); }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            editable={!submitting}
            style={[styles.plateInput, { color: colors.text }]}
          />
          <Pencil size={18} color={colors.textMuted} strokeWidth={2.25} />
        </View>

        <Pressable
          onPress={() => !submitting && setStatePickerOpen(true)}
          style={[styles.stateSelect, { borderColor: colors.border, borderRadius: radius.md }]}
        >
          <Text style={{ color: stateName ? colors.text : colors.textMuted, fontSize: 16 }}>
            {stateName ?? 'Select state (required)'}
          </Text>
          <ChevronDown size={18} color={colors.textMuted} strokeWidth={2.25} />
        </Pressable>

        {error || serverError ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error ?? serverError}</Text>
        ) : null}

        <Text style={[styles.costNote, { color: colors.textMuted, marginTop: spacing.md }]}>
          Plates can be transferred — you&apos;ll confirm the match before anything else.
        </Text>

        <PrimaryButton
          label="Search plate — free"
          loading={submitting}
          onPress={confirm}
          style={{ marginTop: spacing.md }}
        />
        <Pressable onPress={onCancel} disabled={submitting} style={styles.cancelRow} hitSlop={8}>
          <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel &amp; keep scanning</Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>

      <Modal visible={statePickerOpen} animationType="slide" onRequestClose={() => setStatePickerOpen(false)}>
        <View style={[styles.stateList, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text, padding: spacing.lg }]}>Select state</Text>
          <FlatList
            data={US_STATES}
            keyExtractor={(s) => s.code}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { setState(item.code); setStatePickerOpen(false); setError(undefined); }}
                style={[styles.stateRow, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.text, fontSize: 16 }}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 16 }}>{item.code}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>

      <LoadingOverlay visible={submitting} title="Looking up this plate…" messages={PLATE_LOOKUP_MESSAGES} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  avoider: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: { paddingBottom: 36 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#9993', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 14, marginTop: 4 },
  plateBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 14 },
  plateInput: { flex: 1, fontSize: 26, fontWeight: '800', letterSpacing: 4, paddingVertical: 12 },
  stateSelect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, marginTop: 8 },
  error: { fontSize: 14, marginTop: 8 },
  costNote: { fontSize: 13, lineHeight: 18 },
  cancelRow: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  stateList: { flex: 1 },
  stateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
});
