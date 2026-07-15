import type { PaidTier } from '../types/vehicle';

/**
 * Single source of truth for report-tier pricing (Vehify Report Tiers & API
 * Cost, MVP v2). Customer-facing prices only — provider/API costs live in the
 * Laravel backend, never in the app.
 *
 * Tiers, cheapest → most valuable:
 *   Free VIN       — verify the vehicle (NHTSA, $0.00)
 *   Plate          — identify the vehicle (Plate→VIN, $0.25, credited toward Buyer Report)
 *   Buyer Report   — should I buy this? ($1.99, or $1.74 after plate credit)
 *   Premium Report — what happened to this VIN? (+$3 upgrade → $4.99 total)
 */
export const PRICING = {
  /** Plate→VIN lookup fee. Credited toward Buyer's Analysis. */
  plateLookup: 0.25,
  /** Buyer's Analysis full price. */
  buyersAnalysis: 1.99,
  /** Credit applied when the vehicle was reached via a paid plate lookup. */
  plateCredit: 0.25,
  /** Upgrade price from Buyer Report → Premium Report. */
  completeUpgrade: 3.0,
  /** Total paid for the Premium Report (Buyer Report + upgrade). */
  completeTotal: 4.99,
  /**
   * Re-pull a stale report (30+ days) with current data. Priced above the
   * ~$1.50 provider cost of a fresh history pull (CARFAX).
   */
  reportRefresh: 1.99,
} as const;

/** RevenueCat product identifiers per paid tier. */
export const PRODUCT_IDS: Record<PaidTier, string> = {
  buyers_analysis: 'buyers_analysis',
  complete_history: 'complete_history_upgrade',
};

/**
 * Product id for the $0.25 plate lookup (tier 2 — not a PaidTier/report).
 * Provisional until the real RevenueCat product is created; the backend
 * accepts any string today.
 */
export const PLATE_PRODUCT_ID = 'plate_lookup';

/** Product id for refreshing a stale report's data ($1.99). */
export const REPORT_REFRESH_PRODUCT_ID = 'report_refresh';

/** Price for Buyer's Analysis, applying the plate credit when earned. */
export function buyersAnalysisPrice(hasPlateCredit: boolean): number {
  return hasPlateCredit ? PRICING.buyersAnalysis - PRICING.plateCredit : PRICING.buyersAnalysis;
}

/** Format a USD amount for display, e.g. 2.74 → "$2.74". */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
