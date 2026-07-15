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
import { useTheme } from '../theme';
import PrimaryButton from './PrimaryButton';
import { useAccount } from '../hooks/useAccount';

type Mode = 'login' | 'register';

interface Props {
  visible: boolean;
  /** Which tab to open on. */
  initialMode?: Mode;
  onClose: () => void;
  /** Called after a successful login/register (the session is already stored). */
  onSuccess?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Extract a human message from an RTK Query error (401 message / 422 errors). */
function errorMessage(err: unknown): string {
  const data = (err as { data?: { message?: string; errors?: Record<string, string[]> } })?.data;
  if (data?.message) return data.message;
  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined;
  return first ?? 'Something went wrong. Please try again.';
}

/**
 * Email + password auth in a bottom sheet, with a Login/Register toggle. The
 * non-social path — accounts stay optional. Social buttons live on the Account
 * screen; this is what the "Log in · Register" text link opens.
 */
export default function AuthSheet({ visible, initialMode = 'login', onClose, onSuccess }: Props) {
  const { colors, radius, spacing } = useTheme();
  const { register, login, busy } = useAccount();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();

  // Reset every field/tab each time the sheet opens (render-time, no flash).
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setMode(initialMode);
      setName('');
      setEmail('');
      setPassword('');
      setError(undefined);
    }
  }

  const isRegister = mode === 'register';

  const submit = async () => {
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (isRegister && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setError(undefined);
    try {
      if (isRegister) {
        await register({ email: mail, password, ...(name.trim() ? { name: name.trim() } : {}) });
      } else {
        await login({ email: mail, password });
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const tabStyle = (active: boolean) => [
    styles.tab,
    { backgroundColor: active ? colors.primary : colors.surfaceAlt, borderRadius: radius.sm },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.avoider}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
          <View style={styles.grabber} />
          <Text style={[styles.title, { color: colors.text }]}>
            {isRegister ? 'Create an account' : 'Welcome back'}
          </Text>

          <View style={[styles.tabs, { marginVertical: spacing.md }]}>
            <Pressable onPress={() => { setMode('login'); setError(undefined); }} style={tabStyle(!isRegister)}>
              <Text style={[styles.tabText, { color: !isRegister ? colors.onPrimary : colors.text }]}>Log in</Text>
            </Pressable>
            <Pressable onPress={() => { setMode('register'); setError(undefined); }} style={tabStyle(isRegister)}>
              <Text style={[styles.tabText, { color: isRegister ? colors.onPrimary : colors.text }]}>Register</Text>
            </Pressable>
          </View>

          {isRegister ? (
            <TextInput
              value={name}
              onChangeText={(t) => { setName(t); setError(undefined); }}
              placeholder="Name (optional)"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              editable={!busy}
              style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
            />
          ) : null}
          <TextInput
            value={email}
            onChangeText={(t) => { setEmail(t); setError(undefined); }}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!busy}
            style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
          />
          <TextInput
            value={password}
            onChangeText={(t) => { setPassword(t); setError(undefined); }}
            placeholder={isRegister ? 'Password (8+ characters)' : 'Password'}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textContentType={isRegister ? 'newPassword' : 'password'}
            editable={!busy}
            onSubmitEditing={submit}
            style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
          />

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <PrimaryButton
            label={isRegister ? 'Create account' : 'Log in'}
            loading={busy}
            onPress={submit}
            style={{ marginTop: spacing.md }}
          />
          <Pressable onPress={onClose} disabled={busy} style={styles.cancelRow} hitSlop={8}>
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  avoider: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: { paddingBottom: 36 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#9993', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, marginTop: 8 },
  error: { fontSize: 14, marginTop: 8 },
  cancelRow: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 15, fontWeight: '600' },
});
