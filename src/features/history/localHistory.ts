import AsyncStorage from '@react-native-async-storage/async-storage';
import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../../store';
import {
  addEntry,
  clearHistory,
  markPremium,
  setEntries,
} from '../../store/historySlice';
import type { HistoryEntry } from '../../types/history';

const STORAGE_KEY = 'vehify.history.v1';

/**
 * Local, login-free history persistence (spec §14). Uses AsyncStorage so it
 * works in Expo Go today; can be swapped for MMKV once we ship a dev client.
 */
export async function hydrateHistory(dispatch: AppDispatch): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const entries: HistoryEntry[] = raw ? JSON.parse(raw) : [];
    dispatch(setEntries(entries));
  } catch {
    dispatch(setEntries([]));
  }
}

/** Persist history to disk whenever it changes. */
export const historyPersistenceMiddleware = createListenerMiddleware();
historyPersistenceMiddleware.startListening({
  matcher: isAnyOf(addEntry, markPremium, clearHistory),
  effect: async (_action, listenerApi) => {
    const state = listenerApi.getState() as RootState;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.history.entries));
    } catch {
      // best-effort; a failed write shouldn't crash the app
    }
  },
});
