import AsyncStorage from '@react-native-async-storage/async-storage';
import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../../store';
import { markCreditsHeld, setCredits, type CreditsState } from '../../store/creditsSlice';

const STORAGE_KEY = 'vehify.credits.v1';

/** Restore the "ever held credits" flag from disk (phone-only, never backend). */
export async function hydrateCredits(dispatch: AppDispatch): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) dispatch(setCredits(JSON.parse(raw) as CreditsState));
  } catch {
    // fall through to defaults (chip stays hidden)
  }
}

/** Persist the flag whenever it flips. */
export const creditsPersistenceMiddleware = createListenerMiddleware();
creditsPersistenceMiddleware.startListening({
  matcher: isAnyOf(markCreditsHeld),
  effect: async (_action, listenerApi) => {
    const state = listenerApi.getState() as RootState;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.credits));
    } catch {
      // best-effort; a failed write shouldn't crash the app
    }
  },
});
