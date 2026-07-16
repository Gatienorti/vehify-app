import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, GoogleSigninButton, statusCodes } from '@react-native-google-signin/google-signin';
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
// Hidden until real IAP (RevenueCat) ships — spec §16 requires it at launch.
const SHOW_RESTORE_PURCHASES = false as boolean;

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
  const { user, isAuthenticated, signIn, signOut, busy } = useAccount();
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
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Protect your reports</Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>
              Create a free account to keep your lookups and reports backed up and available on any
              device you sign in on.
            </Text>
            {/* Apple's official button (HIG requirement — App Review checks
                the style). Android gets Google only; Apple sign-in is iOS-only. */}
            {Platform.OS === 'ios' ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  isDark
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={12}
                style={[styles.appleButton, { marginTop: spacing.md }]}
                onPress={() => void appleSignIn()}
              />
            ) : null}
            {/* Google's official branded button (their sign-in guidelines),
                matching the official Apple button above. */}
            <GoogleSigninButton
              size={GoogleSigninButton.Size.Wide}
              color={isDark ? GoogleSigninButton.Color.Light : GoogleSigninButton.Color.Dark}
              onPress={() => void googleSignIn()}
              disabled={busy}
              style={[styles.googleButton, { marginTop: Platform.OS === 'ios' ? spacing.sm : spacing.md }]}
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
  appleButton: { height: 48, width: '100%' },
  googleButton: { width: '100%', height: 52, alignSelf: 'center' },
  textLink: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1 },
  rowLabel: { fontSize: 16 },
});
