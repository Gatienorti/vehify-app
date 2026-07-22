import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../theme';
import PrimaryButton from './PrimaryButton';
import { useAccount } from '../hooks/useAccount';

export type AuthMode = 'login' | 'register';
type Step = 'login' | 'register' | 'forgot' | 'reset';

interface Props {
  visible: boolean;
  /** Which tab to open on. */
  initialMode?: AuthMode;
  onClose: () => void;
  /** Called after a successful login/register/reset (the session is already stored). */
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
 * Email + password auth in a bottom sheet: login / register, plus a
 * forgot-password → reset flow (emailed 6-digit code). The non-social path —
 * accounts stay optional. Opened by the "Log in · Register" link on Account.
 */
export default function AuthSheet({ visible, initialMode = 'login', onClose, onSuccess }: Props) {
  const { colors, radius, spacing } = useTheme();
  const { register, login, forgotPassword, resetPassword, busy } = useAccount();
  const [view, setView] = useState<Step>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  // Reset every field/view each time the sheet opens (render-time, no flash).
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setView(initialMode);
      setName('');
      setEmail('');
      setPassword('');
      setCode('');
      setError(undefined);
      setNotice(undefined);
    }
  }

  const go = (v: Step) => { setView(v); setError(undefined); setNotice(undefined); };

  const submit = async () => {
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(undefined);
    try {
      if (view === 'register') {
        if (password.length < 8) return setError('Password must be at least 8 characters.');
        await register({ email: mail, password, ...(name.trim() ? { name: name.trim() } : {}) });
      } else if (view === 'login') {
        if (!password) return setError('Enter your password.');
        await login({ email: mail, password });
      } else if (view === 'forgot') {
        await forgotPassword(mail);
        setNotice(`If ${mail} has an account, we emailed a 6-digit code.`);
        setView('reset');
        return;
      } else {
        if (code.trim().length < 4) return setError('Enter the code from your email.');
        if (password.length < 8) return setError('New password must be at least 8 characters.');
        await resetPassword({ email: mail, code: code.trim(), password });
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
  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }];

  const title =
    view === 'register' ? 'Create an account'
    : view === 'forgot' ? 'Reset your password'
    : view === 'reset' ? 'Enter your code'
    : 'Welcome back';
  const cta =
    view === 'register' ? 'Create account'
    : view === 'forgot' ? 'Send reset code'
    : view === 'reset' ? 'Reset password'
    : 'Log in';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.avoider}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
          <View style={styles.grabber} />
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

          {view === 'login' || view === 'register' ? (
            <View style={[styles.tabs, { marginVertical: spacing.md }]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Log in" onPress={() => go('login')} style={tabStyle(view === 'login')}>
                <Text style={[styles.tabText, { color: view === 'login' ? colors.onPrimary : colors.text }]}>Log in</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Register" onPress={() => go('register')} style={tabStyle(view === 'register')}>
                <Text style={[styles.tabText, { color: view === 'register' ? colors.onPrimary : colors.text }]}>Register</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.subtitle, { color: colors.textMuted, marginTop: 4 }]}>
              {view === 'forgot'
                ? 'Enter your email and we’ll send a 6-digit code.'
                : notice ?? 'Enter the code we emailed and a new password.'}
            </Text>
          )}

          {view === 'register' ? (
            <TextInput
              value={name}
              onChangeText={(t) => { setName(t); setError(undefined); }}
              placeholder="Name (optional)"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              editable={!busy}
              style={inputStyle}
            />
          ) : null}

          {/* Email is shown everywhere except the reset step (it's already known). */}
          {view !== 'reset' ? (
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
              style={inputStyle}
            />
          ) : null}

          {view === 'reset' ? (
            <TextInput
              value={code}
              onChangeText={(t) => { setCode(t.replace(/[^0-9]/g, '')); setError(undefined); }}
              placeholder="6-digit code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              editable={!busy}
              style={inputStyle}
            />
          ) : null}

          {/* Password: on login/register, and the NEW password on reset. Hidden on forgot. */}
          {view !== 'forgot' ? (
            <TextInput
              value={password}
              onChangeText={(t) => { setPassword(t); setError(undefined); }}
              placeholder={view === 'login' ? 'Password' : view === 'reset' ? 'New password (8+ characters)' : 'Password (8+ characters)'}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType={view === 'login' ? 'password' : 'newPassword'}
              editable={!busy}
              onSubmitEditing={submit}
              style={inputStyle}
            />
          ) : null}

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <PrimaryButton label={cta} loading={busy} onPress={submit} style={{ marginTop: spacing.md }} />

          {/* Secondary links vary by view. */}
          {view === 'login' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Forgot password?" onPress={() => go('forgot')} disabled={busy} style={styles.linkRow} hitSlop={8}>
              <Text style={[styles.link, { color: colors.primary }]}>Forgot password?</Text>
            </Pressable>
          ) : view === 'forgot' || view === 'reset' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back to log in" onPress={() => go('login')} disabled={busy} style={styles.linkRow} hitSlop={8}>
              <Text style={[styles.link, { color: colors.textMuted }]}>Back to log in</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} disabled={busy} style={styles.linkRow} hitSlop={8}>
              <Text style={[styles.link, { color: colors.textMuted }]}>Cancel</Text>
            </Pressable>
          )}
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
  subtitle: { fontSize: 14, lineHeight: 19 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, marginTop: 8 },
  error: { fontSize: 14, marginTop: 8 },
  linkRow: { alignItems: 'center', paddingVertical: 14 },
  link: { fontSize: 15, fontWeight: '600' },
});
