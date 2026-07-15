import AsyncStorage from '@react-native-async-storage/async-storage';
import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../../store';
import {
  addEntry,
  clearHistory,
  markPurchased,
  setEntries,
} from '../../store/historySlice';
import type { HistoryEntry } from '../../types/history';

const STORAGE_KEY = 'vehify.history.v1';

/** Entries persisted before the Tiers v2 rename ('premium'/isPremium era). */
type StoredEntry = Omit<HistoryEntry, 'tier'> & {
  tier?: string;
  isPremium?: boolean;
};

/**
 * Migrate legacy persisted entries to the v2 tier model. Old 'premium'
 * purchases map to complete_history (the old $4.99 report included history);
 * anything unrecognized falls back to basic so the UI never renders an
 * unlabeled badge.
 */
export function normalizeEntry(entry: StoredEntry): HistoryEntry {
  const { isPremium, tier, ...rest } = entry;
  if (tier === 'basic' || tier === 'buyers_analysis' || tier === 'complete_history') {
    return { ...rest, tier };
  }
  if (tier === 'premium' || isPremium) {
    return { ...rest, tier: 'complete_history' };
  }
  return { ...rest, tier: 'basic', reportId: undefined };
}

/**
 * Local, login-free history persistence (spec §14). Uses AsyncStorage so it
 * works in Expo Go today; can be swapped for MMKV once we ship a dev client.
 */
export async function hydrateHistory(dispatch: AppDispatch): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const stored: StoredEntry[] = raw ? JSON.parse(raw) : [];
    dispatch(setEntries(stored.map(normalizeEntry)));
  } catch {
    dispatch(setEntries([]));
  }
}

/** Persist history to disk whenever it changes. */
export const historyPersistenceMiddleware = createListenerMiddleware();
historyPersistenceMiddleware.startListening({
  matcher: isAnyOf(addEntry, markPurchased, clearHistory),
  effect: async (_action, listenerApi) => {
    const state = listenerApi.getState() as RootState;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.history.entries));
    } catch {
      // best-effort; a failed write shouldn't crash the app
    }
  },
});
