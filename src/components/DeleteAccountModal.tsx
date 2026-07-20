import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import PrimaryButton from './PrimaryButton';

interface Props {
  visible: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** The word the user must type — the friction that makes this deliberate. */
const CONFIRM_WORD = 'DELETE';

/**
 * Permanent account deletion (App Store 5.1.1(v) / Play policy) is the one
 * action in the app that can't be undone — a two-tap Alert is too easy to
 * fat-finger. Typing DELETE makes it deliberate. Copy is honest about what
 * goes (the account + its identity link) and what stays (this phone's own
 * history and purchased reports).
 */
export default function DeleteAccountModal({ visible, busy, onConfirm, onClose }: Props) {
  const { colors, radius, spacing } = useTheme();
  const [typed, setTyped] = useState('');
  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  // Re-arm the friction on every open — the parent may close the modal
  // directly (success/failure paths call onClose without our close()), and a
  // reopen must never arrive with DELETE pre-typed.
  useEffect(() => {
    if (visible) setTyped('');
  }, [visible]);

  const close = () => {
    setTyped('');
    onClose();
  };

  return (
    // Android back must not dismiss mid-request, same as the backdrop tap.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? () => {} : close}>
      <View style={styles.backdrop}>
        {/* Tap outside to dismiss — but never mid-request. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : close} />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>Delete your account?</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            This permanently deletes your account and unlinks your backed-up lookup history from it.
            Lookups and reports made on this phone stay available on this phone. This can’t be undone.
          </Text>
          <Text style={[styles.body, { color: colors.text, marginTop: 12 }]}>
            Type <Text style={{ fontWeight: '800', color: colors.danger }}>{CONFIRM_WORD}</Text> to confirm:
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={CONFIRM_WORD}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={`Type ${CONFIRM_WORD} to confirm account deletion`}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            style={[
              styles.input,
              { borderColor: armed ? colors.danger : colors.border, color: colors.text, borderRadius: radius.md },
            ]}
          />
          <PrimaryButton
            label="Delete my account"
            loading={busy}
            disabled={!armed}
            onPress={onConfirm}
            style={{ backgroundColor: colors.danger, marginTop: spacing.md }}
          />
          <PrimaryButton label="Cancel" variant="ghost" disabled={busy} onPress={close} style={{ marginTop: 8 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 27, 58, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 400, borderWidth: 1 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20 },
  input: {
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 10,
  },
});
