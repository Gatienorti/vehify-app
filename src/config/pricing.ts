import type { PaidTier } from '../types/vehicle';

/**
 * Single source of truth for report-tier pricing (Vehify Report Tiers & API
 * Cost, MVP v2). Customer-facing prices only — provider/API costs live in the
 * Laravel backend, never in the app.
 *
 * Tiers, cheapest → most valuable:
 *   Free VIN  — verify the vehicle (NHTSA, $0.00)
 *   Plate     — identify the vehicle (Plate→VIN, $0.25, credited toward Analysis)
 *   Analysis  — should I buy this? ($2.99, or $2.74 after plate credit)
 *   History   — what happened to this VIN? (+$5 upgrade → $7.99 total)
 */
export const PRICING = {
  /** Plate→VIN lookup fee. Credited toward Buyer's Analysis. */
  plateLookup: 0.25,
  /** Buyer's Analysis full price. */
  buyersAnalysis: 2.99,
  /** Credit applied when the vehicle was reached via a paid plate lookup. */
  plateCredit: 0.25,
  /** Upgrade price from Buyer's Analysis → Complete Vehicle History. */
  completeUpgrade: 5.0,
  /** Total paid for Complete Vehicle History (analysis + upgrade). */
  completeTotal: 7.99,
} as const;

/** RevenueCat product identifiers per paid tier. */
export const PRODUCT_IDS: Record<PaidTier, string> = {
  buyers_analysis: 'buyers_analysis',
  complete_history: 'complete_history_upgrade',
};

/** Price for Buyer's Analysis, applying the plate credit when earned. */
export function buyersAnalysisPrice(hasPlateCredit: boolean): number {
  return hasPlateCredit ? PRICING.buyersAnalysis - PRICING.plateCredit : PRICING.buyersAnalysis;
}

/** Format a USD amount for display, e.g. 2.74 → "$2.74". */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
