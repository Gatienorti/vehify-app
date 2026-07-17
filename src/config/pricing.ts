import type { PaidTier } from '../types/vehicle';

/**
 * Single source of truth for report-tier pricing. Customer-facing prices
 * only — provider/API costs live in the Laravel backend, never in the app.
 *
 * Tiers, cheapest → most valuable:
 *   Free VIN       — verify the vehicle (FREE)
 *   Plate          — identify the vehicle (Plate→VIN, FREE — funnel opener)
 *   Buyer Report   — should I buy this? ($1.99)
 *   Premium Report — what happened to this VIN? (+$2.99 upgrade → $4.98 total)
 *
 * All prices sit on the store-standard x.99 grid (Apple/Google price points).
 */
export const PRICING = {
  /** Buyer's Analysis. */
  buyersAnalysis: 1.99,
  /** Upgrade price from Buyer Report → Premium Report. */
  completeUpgrade: 2.99,
  /** Total paid for the Premium Report (Buyer Report + upgrade). */
  completeTotal: 4.98,
  /**
   * Re-pull a stale report (30+ days) with current data. Priced above the
   * ~$1.50 provider cost of a fresh history pull (CARFAX) so the margin
   * survives the store's cut (~$2.54 net at 15%).
   */
  reportRefresh: 2.99,
} as const;

/** RevenueCat product identifiers per paid tier. */
export const PRODUCT_IDS: Record<PaidTier, string> = {
  buyers_analysis: 'buyers_analysis',
  complete_history: 'complete_history_upgrade',
};

/** Product id for refreshing a stale report's data ($2.99). */
export const REPORT_REFRESH_PRODUCT_ID = 'report_refresh';

/**
 * Credit cost per report, spent instead of an in-app purchase (credits are
 * bought on the website). The backend is the authority on the actual charge —
 * these values only drive the button label ("Use N credits"). A full history
 * from scratch is 2 credits; an upgrade (already own the Buyer Report) is 1,
 * mirroring the +$2.99 upgrade being cheaper than the $4.98 all-in.
 */
export const CREDIT_COST: Record<PaidTier, number> = {
  buyers_analysis: 1,
  complete_history: 2,
};

/** Credits to unlock `tier`; an upgrade (buyer already owned) is discounted. */
export function creditCostFor(tier: PaidTier, isUpgrade = false): number {
  if (tier === 'complete_history' && isUpgrade) return 1;
  return CREDIT_COST[tier];
}

/** "Use 1 credit" / "Use 2 credits" — the credit-path button label. */
export function creditLabel(cost: number): string {
  return `Use ${cost} credit${cost === 1 ? '' : 's'}`;
}

/** Format a USD amount for display, e.g. 1.99 → "$1.99". */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
