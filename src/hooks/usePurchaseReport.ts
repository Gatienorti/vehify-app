import { useCallback, useRef, useState } from 'react';
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

/**
 * The one purchase flow (mock IAP until RevenueCat): start → confirm →
 * record ownership locally. Throws on failure so the caller owns the retry
 * UX; navigation is the caller's job too (reset vs popTo differs by entry).
 */
export function usePurchaseReport() {
  const dispatch = useAppDispatch();
  const [startPurchase] = useStartPurchaseMutation();
  const [confirmPurchase] = useConfirmPurchaseMutation();
  const [buying, setBuying] = useState(false);
  // Hold the token from a successful `start` so a confirm-phase failure retries
  // confirm ONLY — never a second `start`, which under real IAP would be a
  // second charge. Mirrors ScanScreen's plateTokenRef. Keyed on the exact
  // purchase inputs; a changed mileage/price re-runs start intentionally.
  const startTokenRef = useRef<{ key: string; token: string } | null>(null);

  const buy = useCallback(
    async (vin: string, tier: PaidTier, opts: BuyOptions = {}): Promise<PurchaseConfirmResponse> => {
      track('premium_purchase_started', { vin, tier });
      if (opts.mileage !== undefined) track('mileage_entered', { vin });
      if (opts.askingPrice !== undefined) track('asking_price_entered', { vin });
      setBuying(true);
      const attemptKey = `${vin}|${tier}|${opts.mileage ?? ''}|${opts.askingPrice ?? ''}|${opts.zip ?? ''}`;
      try {
        // TODO: replace with RevenueCat purchase flow; this mocks the store round-trip.
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
          // Charged (or will be) — remember the token before the confirm hop so
          // a confirm failure can resume without re-charging.
          startTokenRef.current = { key: attemptKey, token: purchaseToken };
        }
        const confirm = await confirmPurchase({
          purchaseToken,
          // Unique per purchase — the backend has a unique index on
          // transaction ids (double-mint guard).
          appStoreTransactionId: `mock-txn-${purchaseToken}`,
          platform: 'ios',
          tier,
        }).unwrap();
        // Fully settled — clear so the next purchase starts fresh.
        startTokenRef.current = null;
        // Optimistic paint of the local history badge; the server (via the
        // Purchases/History tag invalidation) is the real ownership record.
        dispatch(markPurchased({ vin, tier: confirm.tier, reportId: confirm.reportId }));
        track('premium_purchase_completed', { vin, tier: confirm.tier });
        return confirm;
      } catch (e) {
        track('premium_purchase_failed', { vin, tier });
        throw e;
      } finally {
        setBuying(false);
      }
    },
    [dispatch, startPurchase, confirmPurchase],
  );

  return { buy, buying };
}
