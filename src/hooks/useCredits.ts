import { useEffect } from 'react';
import { useGetCreditsQuery } from '../services/api';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { markCreditsHeld } from '../store/creditsSlice';

/**
 * Report-credit state for the purchase screens. Balance is server-authoritative
 * (RTK Query) — if the backend doesn't serve `/credits` yet the query errors
 * and balance reads 0, so every screen falls back to in-app purchase exactly as
 * before. `everHeld` is the persisted "has ever had a positive balance" bit
 * that keeps the "Credits: 0" chip visible for a returning credit-buyer while
 * hiding it from everyone who never touched credits.
 */
export function useCredits(): { balance: number; everHeld: boolean } {
  const dispatch = useAppDispatch();
  const { data } = useGetCreditsQuery();
  const balance = data?.balance ?? 0;
  const persistedEverHeld = useAppSelector((s) => s.credits.everHeld);

  useEffect(() => {
    if (balance > 0 && !persistedEverHeld) dispatch(markCreditsHeld());
  }, [balance, persistedEverHeld, dispatch]);

  return { balance, everHeld: persistedEverHeld || balance > 0 };
}
