import { useCallback, useState } from 'react';
import { useAppDispatch } from '../store/hooks';
import { markPurchased } from '../store/historySlice';
import { recordPurchase } from '../store/purchasesSlice';
import { useConfirmPurchaseMutation, useStartPurchaseMutation } from '../services/api';
import { PRODUCT_IDS } from '../config/pricing';
import { track } from '../config/analytics';
import type { PaidTier } from '../types/vehicle';
import type { PurchaseConfirmResponse } from '../types/api';

interface BuyOptions {
  mileage?: number;
  askingPrice?: number;
  hasPlateCredit?: boolean;
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

  const buy = useCallback(
    async (vin: string, tier: PaidTier, opts: BuyOptions = {}): Promise<PurchaseConfirmResponse> => {
      track('premium_purchase_started', { vin, tier });
      if (tier === 'buyers_analysis' && opts.hasPlateCredit) track('plate_credit_applied', { vin });
      if (opts.mileage !== undefined) track('mileage_entered', { vin });
      if (opts.askingPrice !== undefined) track('asking_price_entered', { vin });
      setBuying(true);
      try {
        // TODO: replace with RevenueCat purchase flow; this mocks the store round-trip.
        const start = await startPurchase({
          vin,
          tier,
          productId: PRODUCT_IDS[tier],
          ...(opts.mileage !== undefined ? { mileage: opts.mileage } : {}),
          ...(opts.askingPrice !== undefined ? { askingPrice: opts.askingPrice } : {}),
        }).unwrap();
        const confirm = await confirmPurchase({
          purchaseToken: start.purchaseToken,
          // Unique per purchase — the backend has a unique index on
          // transaction ids (double-mint guard).
          appStoreTransactionId: `mock-txn-${start.purchaseToken}`,
          platform: 'ios',
          tier,
        }).unwrap();
        // Trust the server's tier on the confirm — it is the billing record.
        dispatch(markPurchased({ vin, tier: confirm.tier, reportId: confirm.reportId }));
        dispatch(
          recordPurchase({
            vin,
            tier: confirm.tier,
            reportId: confirm.reportId,
            productId: PRODUCT_IDS[tier],
            purchasedAt: new Date().toISOString(),
          }),
        );
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
