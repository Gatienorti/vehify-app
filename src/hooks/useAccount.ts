import { useCallback, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearAuth, setAuth } from '../store/authSlice';
import {
  useLoginEmailMutation,
  useLogoutMutation,
  useRegisterEmailMutation,
  useSocialSignInMutation,
  useSyncHistoryMutation,
} from '../services/api';
import { getDeviceId } from '../config/deviceId';
import { track, type AnalyticsEvent } from '../config/analytics';
import type { HistoryEntry } from '../types/history';
import type {
  AuthResponse,
  EmailLoginRequest,
  EmailRegisterRequest,
  HistorySyncItem,
  SocialSignInRequest,
} from '../types/api';

/**
 * The one place sign-in / sign-out logic lives. Every entry point (social,
 * email register, email login) funnels through `complete`, which stores the
 * session then best-effort syncs this device's local history onto the account.
 * Account is always optional — a sync failure never blocks the sign-in.
 */
export function useAccount() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => !!s.auth.token);
  const localHistory = useAppSelector((s) => s.history.entries);
  const [socialSignIn] = useSocialSignInMutation();
  const [registerEmail] = useRegisterEmailMutation();
  const [loginEmail] = useLoginEmailMutation();
  const [logout] = useLogoutMutation();
  const [syncHistory] = useSyncHistoryMutation();
  const [busy, setBusy] = useState(false);

  // Shared tail for every successful sign-in path.
  const complete = useCallback(
    async (res: AuthResponse, event: AnalyticsEvent) => {
      dispatch(setAuth({ token: res.token, user: res.user }));
      track(event);
      // Claim anonymous device activity + push local history up. The Bearer
      // token is now in the store, so this call is authenticated. Best-effort.
      try {
        const deviceId = await getDeviceId();
        await syncHistory({ deviceId, items: localHistory.map(toSyncItem) }).unwrap();
        track('history_synced', { count: localHistory.length });
      } catch {
        // Non-fatal — the account exists; a later call can re-sync.
      }
      return res;
    },
    [dispatch, syncHistory, localHistory],
  );

  const run = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setBusy(true);
      try {
        return await fn();
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const signIn = useCallback(
    (req: SocialSignInRequest) =>
      run(async () => complete(await socialSignIn(req).unwrap(), 'account_created')),
    [run, complete, socialSignIn],
  );

  const register = useCallback(
    (req: EmailRegisterRequest) =>
      run(async () => complete(await registerEmail(req).unwrap(), 'account_created')),
    [run, complete, registerEmail],
  );

  const login = useCallback(
    (req: EmailLoginRequest) =>
      run(async () => complete(await loginEmail(req).unwrap(), 'account_logged_in')),
    [run, complete, loginEmail],
  );

  const signOut = useCallback(
    () =>
      run(async () => {
        // Revoke server-side first (needs the token), then drop the local session.
        try {
          await logout().unwrap();
        } catch {
          // Even if the network call fails, clear locally so the user is signed out.
        }
        dispatch(clearAuth());
        track('account_signed_out');
      }),
    [run, logout, dispatch],
  );

  return { user, isAuthenticated, signIn, register, login, signOut, busy };
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
