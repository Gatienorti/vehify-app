import type { PaidTier } from '../types/vehicle';

/**
 * Single source of truth for report-tier pricing. Customer-facing prices
 * only — provider/API costs live in the Laravel backend, never in the app.
 *
 * Tiers, cheapest → most valuable:
 *   Free VIN       — verify the vehicle (FREE)
 *   Plate          — identify the vehicle (Plate→VIN, FREE — funnel opener)
 *   Buyer Report   — should I buy this? ($1.99)
 *   Premium Report — what happened to this VIN? (+$3 upgrade → $4.99 total)
 */
export const PRICING = {
  /** Buyer's Analysis. */
  buyersAnalysis: 1.99,
  /** Upgrade price from Buyer Report → Premium Report. */
  completeUpgrade: 3.0,
  /** Total paid for the Premium Report (Buyer Report + upgrade). */
  completeTotal: 4.99,
  /**
   * Re-pull a stale report (30+ days) with current data. Priced above the
   * ~$1.50 provider cost of a fresh history pull (CARFAX).
   */
  reportRefresh: 2.0,
} as const;

/** RevenueCat product identifiers per paid tier. */
export const PRODUCT_IDS: Record<PaidTier, string> = {
  buyers_analysis: 'buyers_analysis',
  complete_history: 'complete_history_upgrade',
};

/** Product id for refreshing a stale report's data ($2.00). */
export const REPORT_REFRESH_PRODUCT_ID = 'report_refresh';

/** Format a USD amount for display, e.g. 1.99 → "$1.99". */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
