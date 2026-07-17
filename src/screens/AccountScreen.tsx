import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import {
  ChevronRight,
  FileText,
  HelpCircle,
  Moon,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { useAppDispatch } from '../store/hooks';
import { markPurchased } from '../store/historySlice';
import { setThemePreference } from '../store/settingsSlice';
import { useAccount } from '../hooks/useAccount';
import { useLazyGetPurchasesQuery } from '../services/api';
import AuthSheet, { type AuthMode } from '../components/AuthSheet';
import DeleteAccountModal from '../components/DeleteAccountModal';
import GoogleSignInButton from '../components/GoogleSignInButton';
import PrimaryButton from '../components/PrimaryButton';
import { TAB_BAR_CLEARANCE } from '../components/FloatingTabBar';
import { track } from '../config/analytics';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_SIGN_IN_READY, GOOGLE_WEB_CLIENT_ID } from '../config/socialAuth';
import type { TabScreenProps } from '../types/navigation';

// One-time SDK config (module scope — before any button is pressed). The web
// client id is the token audience the backend verifies (services.google.client_id).
if (GOOGLE_SIGN_IN_READY) {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });
}

type Props = TabScreenProps<'Account'>;

const PRIVACY_URL = 'https://vehify.app/privacy';
// Placeholder support channel until a real contact form/page exists.
const SUPPORT_EMAIL = 'gatien.orti@gmail.com';
// Live with RevenueCat: restore is server-backed (GET /purchases by account
// or device) — spec §16 requires it at launch.
const SHOW_RESTORE_PURCHASES = true as boolean;

function Row({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.row, { borderColor: colors.border }]}>
      <Icon size={21} color={colors.textMuted} strokeWidth={2.25} />
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <ChevronRight size={19} color={colors.textMuted} strokeWidth={2.25} style={{ marginLeft: 'auto' }} />
    </Pressable>
  );
}

export default function AccountScreen(_props: Props) {
  const { colors, spacing, isDark } = useTheme();
  const dispatch = useAppDispatch();
  const { user, isAuthenticated, signIn, signOut, deleteAccount, busy } = useAccount();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  // Native Sign in with Apple → identity token → backend verify → session.
  // Cancel is silent (not an error); Apple only shares the name on the very
  // first authorization, so pass it along when present.
  const appleSignIn = async () => {
    track('account_prompt_viewed', { source: 'account_tab', provider: 'apple' });
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) throw new Error('no identity token');
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
      await signIn({
        provider: 'apple',
        identityToken: cred.identityToken,
        ...(name ? { name } : {}),
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Sign-in didn’t complete', 'Please try again.');
    }
  };

  // Native Google sign-in → ID token (audience = our web client id) → backend.
  const googleSignIn = async () => {
    track('account_prompt_viewed', { source: 'account_tab', provider: 'google' });
    if (!GOOGLE_SIGN_IN_READY) {
      Alert.alert('Coming soon', 'Sign in with Google is on the way.');
      return;
    }
    try {
      await GoogleSignin.hasPlayServices();
      const res = await GoogleSignin.signIn();
      if (res.type !== 'success' || !res.data.idToken) return; // cancelled
      await signIn({
        provider: 'google',
        identityToken: res.data.idToken,
        ...(res.data.user.name ? { name: res.data.user.name } : {}),
      });
    } catch (e) {
      if ((e as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED) return;
      Alert.alert('Sign-in didn’t complete', 'Please try again.');
    }
  };

  // Device-local setting (AsyncStorage via the settings slice) — never synced
  // to the backend. The toggle reflects the effective theme (OS or override).
  const toggleDarkMode = (dark: boolean) => {
    dispatch(setThemePreference(dark ? 'dark' : 'light'));
    track('theme_changed', { mode: dark ? 'dark' : 'light' });
  };
  const [fetchPurchases, { isFetching: restoring }] = useLazyGetPurchasesQuery();

  // Permanent deletion (App Store 5.1.1(v) / Play policy). Irreversible, so
  // the modal makes it deliberate: the user must type DELETE to arm the
  // button. Lookups + reports made on THIS phone stay available to it
  // (device-owned); only the account and its identity link are erased.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const runDeleteAccount = async () => {
    try {
      await deleteAccount();
      setDeleteOpen(false);
      Alert.alert('Account deleted', 'Your account is gone and this phone is signed out. Your lookups and reports made on this phone are still here — you can keep using Vehify without an account.');
    } catch {
      setDeleteOpen(false);
      Alert.alert('Couldn’t delete your account', 'We couldn’t reach the server just now — your account is unchanged. Please try again.');
    }
  };

  // Server-backed restore: pull the owner's paid reports (by account or device)
  // and re-seed the local entitlement cache, so owned-report shortcuts work
  // after a reinstall or on a new device. History itself is server-authoritative
  // (its tier badges come from GET /history), so we only rebuild the purchases
  // slice + refresh the badges for any locally-known entries.
  const restorePurchases = async () => {
    track('restore_purchases_tapped');
    try {
      const purchases = await fetchPurchases().unwrap();
      if (purchases.length === 0) {
        Alert.alert('Nothing to restore', 'No report purchases were found for this account or device.');
        return;
      }
      // Server is the ownership record; just refresh the local history badges
      // (paint) for any entries we already show.
      purchases.forEach((p) => {
        dispatch(markPurchased({ vin: p.vin, tier: p.tier, reportId: p.reportId }));
      });
      track('purchases_restored', { count: purchases.length });
      Alert.alert(
        'Purchases restored',
        `${purchases.length} report${purchases.length === 1 ? '' : 's'} restored.`,
      );
    } catch {
      Alert.alert('Couldn’t restore', 'We couldn’t reach the server just now. Please try again.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE, gap: spacing.lg }}>
        <Text style={[styles.header, { color: colors.text }]}>Account</Text>

        {/* Optional account — only offered AFTER value is delivered (spec §15). */}
        {isAuthenticated && user ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Signed in</Text>
            <Text style={[styles.cardBody, { color: colors.text }]}>{user.name}</Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>{user.email}</Text>
            <Text style={[styles.cardBody, { color: colors.textMuted, marginTop: spacing.sm }]}>
              Your reports are backed up to this account and available on any device you sign in on.
            </Text>
            <PrimaryButton
              label="Log out"
              variant="secondary"
              loading={busy}
              onPress={() => void signOut()}
              style={{ marginTop: spacing.md }}
            />
            <Pressable onPress={() => setDeleteOpen(true)} disabled={busy} hitSlop={8} style={styles.deleteLinkWrap}>
              <Text style={[styles.deleteLink, { color: colors.danger }]}>Delete account</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Protect your reports</Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>
              Create a free account to keep your lookups and reports backed up and available on any
              device you sign in on.
            </Text>
            {/* Custom Apple button per Apple's branding spec (black face, white
                 logo, approved title) — custom is allowed and lets the logo
                size pair with the Google button's G. iOS-only. */}
            {Platform.OS === 'ios' ? (
              <Pressable
                onPress={() => void appleSignIn()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.appleButton,
                  {
                    backgroundColor: isDark ? '#FFFFFF' : '#000000',
                    marginTop: spacing.md,
                    opacity: pressed || busy ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={[styles.appleLogo, { color: isDark ? '#000000' : '#FFFFFF' }]}></Text>
                <Text style={[styles.appleLabel, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                  Continue with Apple
                </Text>
              </Pressable>
            ) : null}
            <GoogleSignInButton
              onPress={() => void googleSignIn()}
              disabled={busy}
              style={{ marginTop: Platform.OS === 'ios' ? spacing.sm : spacing.md }}
            />
            <View style={styles.textLinkRow}>
              <Pressable onPress={() => openAuth('login')} disabled={busy} hitSlop={8}>
                <Text style={[styles.textLink, { color: colors.primary }]}>Log in</Text>
              </Pressable>
              <Text style={[styles.textLink, { color: colors.textMuted, marginHorizontal: 8 }]}>·</Text>
              <Pressable onPress={() => openAuth('register')} disabled={busy} hitSlop={8}>
                <Text style={[styles.textLink, { color: colors.primary }]}>Register</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={{ gap: 0 }}>
          <View style={[styles.row, { borderColor: colors.border }]}>
            <Moon size={21} color={colors.textMuted} strokeWidth={2.25} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Dark mode</Text>
            <Switch
              value={isDark}
              onValueChange={toggleDarkMode}
              thumbColor={colors.primary}
              trackColor={{ false: colors.surfaceAlt, true: colors.surfaceAlt }}
              ios_backgroundColor={colors.surfaceAlt}
              style={{ marginLeft: 'auto' }}
            />
          </View>
          {SHOW_RESTORE_PURCHASES ? (
            <Row
              icon={RefreshCw}
              label={restoring ? 'Restoring…' : 'Restore purchases'}
              onPress={() => void restorePurchases()}
            />
          ) : null}
          <Row
            icon={HelpCircle}
            label="Support"
            onPress={() => {
              Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Vehify support`).catch(() =>
                Alert.alert('Support', `Email us at ${SUPPORT_EMAIL}`),
              );
            }}
          />
          <Row
            icon={FileText}
            label="Legal & privacy"
            onPress={() => {
              Linking.openURL(PRIVACY_URL).catch(() => {});
            }}
          />
        </View>
      </ScrollView>

      <AuthSheet visible={authOpen} initialMode={authMode} onClose={() => setAuthOpen(false)} />
      <DeleteAccountModal
        visible={deleteOpen}
        busy={busy}
        onConfirm={() => void runDeleteAccount()}
        onClose={() => setDeleteOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { fontSize: 32, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  cardBody: { fontSize: 14, lineHeight: 20 },
  textLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 48,
    borderRadius: 12,
    width: '100%',
  },
  // The  glyph sits slightly low in the em box — nudge up to optically center.
  appleLogo: { fontSize: 24, marginTop: -3 },
  appleLabel: { fontSize: 17, fontWeight: '600' },
  textLink: { fontSize: 15, fontWeight: '600' },
  deleteLinkWrap: { alignSelf: 'center', paddingTop: 14, paddingBottom: 2 },
  deleteLink: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1 },
  rowLabel: { fontSize: 16 },
});
