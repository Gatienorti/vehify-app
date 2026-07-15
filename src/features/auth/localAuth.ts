import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../../store';
import { clearAuth, hydrateAuth, setAuth } from '../../store/authSlice';
import { clearSession, loadSession, saveSession } from '../../config/authToken';

/** Restore the persisted account session (token + user) from SecureStore. */
export async function hydrateAuthSession(dispatch: AppDispatch): Promise<void> {
  const session = await loadSession();
  dispatch(hydrateAuth(session));
}

/** Mirror auth changes to secure storage: save on sign-in, clear on logout. */
export const authPersistenceMiddleware = createListenerMiddleware();
authPersistenceMiddleware.startListening({
  matcher: isAnyOf(setAuth, clearAuth),
  effect: async (_action, listenerApi) => {
    const state = listenerApi.getState() as RootState;
    if (state.auth.token && state.auth.user) {
      await saveSession({ token: state.auth.token, user: state.auth.user });
    } else {
      await clearSession();
    }
  },
});
