/**
 * Persisted account session (Sanctum bearer token + user), stored in the iOS
 * Keychain / Android Keystore (expo-secure-store) — it's a credential, so it
 * lives with the device id, not in AsyncStorage. Survives app restarts;
 * cleared on logout.
 */
import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from '../store/authSlice';

const KEY = 'vehify_auth_session';

export interface StoredSession {
  token: string;
  user: AuthUser;
}

/** Read the saved session on boot, or null if signed out / storage unavailable. */
export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

/** Persist after a successful sign-in. Best-effort — never crash on failure. */
export async function saveSession(session: StoredSession): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session));
  } catch {
    // A failed write just means the session won't survive a restart.
  }
}

/** Remove on logout. */
export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ignore
  }
}
