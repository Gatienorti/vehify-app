import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pencil } from 'lucide-react-native';
import { useTheme } from '../theme';
import { VIN_DECODE_MESSAGES } from '../config/loadingMessages';
import PrimaryButton from './PrimaryButton';
import LoadingOverlay from './LoadingOverlay';
import { normalizeVin, validateVin } from '../utils/vin';

interface Props {
  visible: boolean;
  initialVin: string;
  submitting?: boolean;
  /** Server/network failure from the lookup itself (validation errors are local). */
  serverError?: string | null;
  onCancel: () => void;
  onConfirm: (vin: string) => void;
}

export default function VinConfirmSheet({
  visible,
  initialVin,
  submitting = false,
  serverError = null,
  onCancel,
  onConfirm,
}: Props) {
  const { colors, radius, spacing } = useTheme();
  const [vin, setVin] = useState(initialVin);
  const [error, setError] = useState<string | undefined>();

  // Re-seed when sheet opens with a new detection.
  const seedKey = visible ? initialVin : null;
  const [prevSeedKey, setPrevSeedKey] = useState<string | null>(null);
  if (seedKey !== prevSeedKey) {
    setPrevSeedKey(seedKey);
    if (seedKey !== null) {
      setVin(initialVin);
      setError(undefined);
    }
  }

  const confirm = () => {
    const normalized = normalizeVin(vin);
    const check = validateVin(normalized);
    if (!check.valid) {
      setError(check.error);
      return;
    }
    onConfirm(normalized);
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
        <Text style={[styles.title, { color: colors.text }]}>Confirm the VIN</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Make sure it matches the VIN on the windshield or driver&apos;s door jamb.
        </Text>

        <View style={[styles.vinBox, { borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.md }]}>
          <TextInput
            value={vin}
            onChangeText={(t) => {
              setVin(t.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              setError(undefined);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={17}
            editable={!submitting}
            style={[styles.vinInput, { color: colors.text }]}
          />
          <Pencil size={18} color={colors.textMuted} strokeWidth={2.25} />
        </View>

        {error || serverError ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error ?? serverError}</Text>
        ) : null}

        <PrimaryButton
          label="Search VIN — free"
          loading={submitting}
          onPress={confirm}
          style={{ marginTop: spacing.lg }}
        />
        <Pressable onPress={onCancel} disabled={submitting} style={styles.cancelRow} hitSlop={8}>
          <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel &amp; keep scanning</Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={submitting} title="Decoding this VIN…" messages={VIN_DECODE_MESSAGES} />
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
  vinBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 14 },
  vinInput: { flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: 2, paddingVertical: 14 },
  error: { fontSize: 14, marginTop: 8 },
  cancelRow: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 15, fontWeight: '600' },
});
