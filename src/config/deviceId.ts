/**
 * Anonymous device identity (spec §14 pre-login continuity).
 *
 * A self-generated UUID stored in the iOS Keychain / Android Keystore
 * (expo-secure-store), so it survives app reinstalls. Sent as `X-Device-Id`
 * on every API call so the backend can keep lookup history and purchases for
 * this phone before any account exists, then claim them at login sync.
 *
 * Deliberately NOT a hardware ID: Apple forbids UDID and the ad ID needs the
 * App Tracking Transparency prompt. This is pseudonymous and client-generated —
 * fine for continuity and soft rate limits, never a security boundary
 * (purchases are still verified by store receipts).
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'vehify_device_id';

let cached: string | null = null;

/** UUIDv4. Math.random is fine here — this is an anon id, not a credential. */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
    return v.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const fresh = generateUuid();
    await SecureStore.setItemAsync(KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    // Keychain unavailable (rare) — fall back to a per-session id rather than
    // failing the API call. History just won't persist across launches.
    cached = cached ?? generateUuid();
    return cached;
  }
}
