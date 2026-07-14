import AsyncStorage from '@react-native-async-storage/async-storage';
import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../../store';
import {
  recordPurchase,
  setPurchases,
  type PurchaseRecord,
} from '../../store/purchasesSlice';

const STORAGE_KEY = 'vehify.purchases.v1';

/**
 * Device-local purchase persistence (spec §16): reports are linked to the
 * device first, synced to an account if/when one is created. Note there is
 * deliberately NO clear action — clearing history must never touch these.
 */
export async function hydratePurchases(dispatch: AppDispatch): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const records: PurchaseRecord[] = raw ? JSON.parse(raw) : [];
    dispatch(setPurchases(records));
  } catch {
    dispatch(setPurchases([]));
  }
}

/** Persist purchases to disk whenever they change. */
export const purchasesPersistenceMiddleware = createListenerMiddleware();
purchasesPersistenceMiddleware.startListening({
  matcher: isAnyOf(recordPurchase),
  effect: async (_action, listenerApi) => {
    const state = listenerApi.getState() as RootState;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.purchases.records));
    } catch {
      // best-effort; a failed write shouldn't crash the app
    }
  },
});
