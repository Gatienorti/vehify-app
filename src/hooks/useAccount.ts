import { useCallback, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearAuth, setAuth } from '../store/authSlice';
import { useLogoutMutation, useSocialSignInMutation, useSyncHistoryMutation } from '../services/api';
import { getDeviceId } from '../config/deviceId';
import { track } from '../config/analytics';
import type { HistoryEntry } from '../types/history';
import type { HistorySyncItem, SocialSignInRequest } from '../types/api';

/**
 * The one place sign-in / sign-out logic lives. The social buttons (and, later,
 * any other entry) call `signIn`; it stores the session, then best-effort syncs
 * this device's local history onto the new account. Account is always optional —
 * a sync failure never blocks the sign-in.
 */
export function useAccount() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => !!s.auth.token);
  const localHistory = useAppSelector((s) => s.history.entries);
  const [socialSignIn] = useSocialSignInMutation();
  const [logout] = useLogoutMutation();
  const [syncHistory] = useSyncHistoryMutation();
  const [busy, setBusy] = useState(false);

  const signIn = useCallback(
    async (req: SocialSignInRequest) => {
      setBusy(true);
      try {
        const res = await socialSignIn(req).unwrap();
        dispatch(setAuth({ token: res.token, user: res.user }));
        track('account_created', { provider: req.provider });
        // Claim anonymous device activity + push local history up. Best-effort:
        // the Bearer token is now in the store, so this call is authenticated.
        try {
          const deviceId = await getDeviceId();
          await syncHistory({ deviceId, items: localHistory.map(toSyncItem) }).unwrap();
          track('history_synced', { count: localHistory.length });
        } catch {
          // Non-fatal — the account exists; a later call can re-sync.
        }
        return res;
      } finally {
        setBusy(false);
      }
    },
    [dispatch, socialSignIn, syncHistory, localHistory],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      // Revoke server-side first (needs the token), then drop the local session.
      try {
        await logout().unwrap();
      } catch {
        // Even if the network call fails, clear locally so the user is signed out.
      }
      dispatch(clearAuth());
      track('account_signed_out');
    } finally {
      setBusy(false);
    }
  }, [dispatch, logout]);

  return { user, isAuthenticated, signIn, signOut, busy };
}

function toSyncItem(e: HistoryEntry): HistorySyncItem {
  return {
    lookup_type: e.lookupType,
    vin: e.vin,
    ...(e.plate ? { plate: e.plate } : {}),
    ...(e.state ? { state: e.state } : {}),
    looked_up_at: e.lookedUpAt,
  };
}
