import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { PRODUCT_CATEGORY } from 'react-native-purchases';
import { useAppDispatch } from '../store/hooks';
import { markPurchased } from '../store/historySlice';
import {
  useConfirmPurchaseMutation,
  useRedeemReportMutation,
  useStartPurchaseMutation,
} from '../services/api';
import { PRODUCT_IDS } from '../config/pricing';
import { track } from '../config/analytics';
import type { PaidTier } from '../types/vehicle';
import type { PurchaseConfirmResponse } from '../types/api';

/** Thrown when the user closes the store's purchase sheet — not a failure. */
export class PurchaseCancelledError extends Error {
  constructor() {
    super('purchase cancelled');
    this.name = 'PurchaseCancelledError';
  }
}

/**
 * Run the store purchase through RevenueCat and return the transaction id the
 * backend records against its unique index. Cancel → PurchaseCancelledError.
 * (Against the Test Store the sheet is simulated and nothing is charged;
 * against real stores this is the actual payment.)
 */
export async function purchaseThroughStore(productId: string): Promise<string> {
  // NON_SUBSCRIPTION is required: getProducts defaults to subscriptions only,
  // silently returning [] for one-time products (all of ours). Some store
  // backends (Test Store/web billing) have categorized one-time products
  // inconsistently — if the filtered ask comes back empty, ask unfiltered
  // before giving up.
  let products = await Purchases.getProducts([productId], PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  if (!products.length) {
    products = await Purchases.getProducts([productId]);
  }
  if (__DEV__) {
    console.log(
      `[purchase] getProducts("${productId}") → ${products.length ? products.map((p) => `${p.identifier} (${p.productCategory ?? '?'})`).join(', ') : 'EMPTY'}`,
    );
  }
  const [product] = products;
  if (!product) {
    throw new Error(`RevenueCat has no product "${productId}" for this store`);
  }
  try {
    const result = await Purchases.purchaseStoreProduct(product);
    const transactionId = result.transaction?.transactionIdentifier;
    if (!transactionId) {
      throw new Error('RevenueCat did not return a store transaction identifier');
    }

    return transactionId;
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) throw new PurchaseCancelledError();
    throw e;
  }
}

/**
 * The one purchase flow: backend `start` reserves the report → RevenueCat
 * runs the STORE purchase → backend `confirm` records the real transaction
 * and queues generation. No buyer inputs (the odometer/asking-price sheet was
 * dropped with the valuation move — Premium's valuation mileage comes from
 * the history records). Throws on failure so the caller owns the retry UX
 * (cancellations throw PurchaseCancelledError — treat those as silence, not
 * errors); navigation is the caller's job too.
 */
export function usePurchaseReport() {
  const dispatch = useAppDispatch();
  const [startPurchase] = useStartPurchaseMutation();
  const [confirmPurchase] = useConfirmPurchaseMutation();
  const [redeemReport] = useRedeemReportMutation();
  const [buying, setBuying] = useState(false);
  // Hold the token from a successful `start` so a later-phase failure retries
  // from the store/confirm step ONLY — never a second `start`.
  const startTokenRef = useRef<{ key: string; token: string } | null>(null);
  // If the STORE purchase succeeded but confirm failed (network blip), retry
  // must reuse the same transaction — never buy twice.
  const paidTxRef = useRef<{ token: string; txId: string } | null>(null);
  // Stable idempotency key per credit-redeem attempt: a retry with the same
  // inputs reuses it, so the backend returns the same report instead of
  // spending a second credit. Cleared once the redeem settles.
  const redeemKeyRef = useRef<{ key: string; token: string } | null>(null);

  const buy = useCallback(
    async (vin: string, tier: PaidTier): Promise<PurchaseConfirmResponse> => {
      track('premium_purchase_started', { vin, tier });
      setBuying(true);
      const attemptKey = `${vin}|${tier}`;
      try {
        // 1. Reserve server-side.
        let purchaseToken = startTokenRef.current?.key === attemptKey ? startTokenRef.current.token : null;
        if (!purchaseToken) {
          const start = await startPurchase({
            vin,
            tier,
            productId: PRODUCT_IDS[tier],
          }).unwrap();
          purchaseToken = start.purchaseToken;
          startTokenRef.current = { key: attemptKey, token: purchaseToken };
        }

        // 2. The real store purchase (RevenueCat) — reused on confirm-retry.
        let txId = paidTxRef.current?.token === purchaseToken ? paidTxRef.current.txId : null;
        if (!txId) {
          txId = await purchaseThroughStore(PRODUCT_IDS[tier]);
          paidTxRef.current = { token: purchaseToken, txId };
        }

        // 3. Record the payment + queue generation.
        const confirm = await confirmPurchase({
          purchaseToken,
          appStoreTransactionId: txId,
          platform: Platform.OS === 'android' ? 'android' : 'ios',
          tier,
        }).unwrap();
        // Fully settled — clear so the next purchase starts fresh.
        startTokenRef.current = null;
        paidTxRef.current = null;
        // Optimistic paint of the local history badge; the server (via the
        // Purchases/History tag invalidation) is the real ownership record.
        dispatch(markPurchased({ vin, tier: confirm.tier, reportId: confirm.reportId }));
        track('premium_purchase_completed', { vin, tier: confirm.tier });
        return confirm;
      } catch (e) {
        if (!(e instanceof PurchaseCancelledError)) {
          if (__DEV__) {
            const err = e as { code?: string; message?: string; underlyingErrorMessage?: string; userInfo?: unknown };
            console.log(
              '[purchase] failed:',
              err.code ?? '',
              err.message ?? String(e),
              err.underlyingErrorMessage ?? '',
              err.userInfo ? JSON.stringify(err.userInfo) : '',
            );
          }
          track('premium_purchase_failed', { vin, tier });
        }
        throw e;
      } finally {
        setBuying(false);
      }
    },
    [dispatch, startPurchase, confirmPurchase],
  );

  /**
   * Unlock a report by spending credits instead of an in-app purchase. No
   * store involved — the backend checks the balance, decrements, and queues
   * generation, returning the same shape as a paid confirm. Only ever called
   * when the caller has confirmed the balance covers the cost; the backend
   * re-validates and rejects otherwise. Throws on failure (caller owns retry).
   */
  const redeem = useCallback(
    async (vin: string, tier: PaidTier): Promise<PurchaseConfirmResponse> => {
      track('credit_redeem_started', { vin, tier });
      setBuying(true);
      // Stable across retries of the same attempt.
      const attemptKey = `${vin}|${tier}`;
      const idempotencyKey =
        redeemKeyRef.current?.key === attemptKey
          ? redeemKeyRef.current.token
          : `${attemptKey}|${Date.now()}`;
      redeemKeyRef.current = { key: attemptKey, token: idempotencyKey };
      try {
        const confirm = await redeemReport({
          vin,
          tier,
          idempotencyKey,
        }).unwrap();
        // Settled — the next purchase gets a fresh key.
        redeemKeyRef.current = null;
        dispatch(markPurchased({ vin, tier: confirm.tier, reportId: confirm.reportId }));
        track('credit_redeemed', { vin, tier: confirm.tier });
        return confirm;
      } catch (e) {
        track('credit_redeem_failed', { vin, tier });
        throw e;
      } finally {
        setBuying(false);
      }
    },
    [dispatch, redeemReport],
  );

  return { buy, redeem, buying };
}
