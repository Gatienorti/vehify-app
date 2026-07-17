import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { PRODUCT_CATEGORY } from 'react-native-purchases';
import { useAppDispatch } from '../store/hooks';
import { markPurchased } from '../store/historySlice';
import { useConfirmPurchaseMutation, useStartPurchaseMutation } from '../services/api';
import { PRODUCT_IDS } from '../config/pricing';
import { track } from '../config/analytics';
import type { PaidTier } from '../types/vehicle';
import type { PurchaseConfirmResponse } from '../types/api';

interface BuyOptions {
  mileage?: number;
  askingPrice?: number;
  /** Buyer's 5-digit ZIP — unlocks charging density on EV reports. */
  zip?: string;
}

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
    return result.transaction?.transactionIdentifier ?? `rc-${result.customerInfo.originalAppUserId}-${productId}`;
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) throw new PurchaseCancelledError();
    throw e;
  }
}

/**
 * The one purchase flow: backend `start` reserves the report (with the
 * buyer's inputs) → RevenueCat runs the STORE purchase → backend `confirm`
 * records the real transaction and queues generation. Throws on failure so
 * the caller owns the retry UX (cancellations throw PurchaseCancelledError —
 * treat those as silence, not errors); navigation is the caller's job too.
 */
export function usePurchaseReport() {
  const dispatch = useAppDispatch();
  const [startPurchase] = useStartPurchaseMutation();
  const [confirmPurchase] = useConfirmPurchaseMutation();
  const [buying, setBuying] = useState(false);
  // Hold the token from a successful `start` so a later-phase failure retries
  // from the store/confirm step ONLY — never a second `start`. Keyed on the
  // exact purchase inputs; changed mileage/price re-runs start intentionally.
  const startTokenRef = useRef<{ key: string; token: string } | null>(null);
  // If the STORE purchase succeeded but confirm failed (network blip), retry
  // must reuse the same transaction — never buy twice.
  const paidTxRef = useRef<{ token: string; txId: string } | null>(null);

  const buy = useCallback(
    async (vin: string, tier: PaidTier, opts: BuyOptions = {}): Promise<PurchaseConfirmResponse> => {
      track('premium_purchase_started', { vin, tier });
      if (opts.mileage !== undefined) track('mileage_entered', { vin });
      if (opts.askingPrice !== undefined) track('asking_price_entered', { vin });
      setBuying(true);
      const attemptKey = `${vin}|${tier}|${opts.mileage ?? ''}|${opts.askingPrice ?? ''}|${opts.zip ?? ''}`;
      try {
        // 1. Reserve server-side (carries mileage/asking/zip into generation).
        let purchaseToken = startTokenRef.current?.key === attemptKey ? startTokenRef.current.token : null;
        if (!purchaseToken) {
          const start = await startPurchase({
            vin,
            tier,
            productId: PRODUCT_IDS[tier],
            ...(opts.mileage !== undefined ? { mileage: opts.mileage } : {}),
            ...(opts.askingPrice !== undefined ? { askingPrice: opts.askingPrice } : {}),
            ...(opts.zip !== undefined ? { zip: opts.zip } : {}),
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

  return { buy, buying };
}
