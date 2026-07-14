export interface Vehicle {
  vin: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  color?: string;
  bodyStyle?: string;
  engine?: string;
  transmission?: string;
  driveType?: string;
  fuelType?: string;
  manufacturer?: string;
}

/** Where a lookup result came from — drives free-refresh rules (spec §9, §10). */
export type LookupSource = 'cache' | 'live';

/**
 * What the user owns for a vehicle (Report Tiers MVP v2):
 *   basic            — free VIN/plate result (verify + identify)
 *   buyers_analysis  — paid "should I buy this?" report ($2.99 / $2.74)
 *   complete_history — buyers_analysis + full history ($7.99)
 */
export type ReportTier = 'basic' | 'buyers_analysis' | 'complete_history';

/** The tiers that are actual purchased reports (everything above `basic`). */
export type PaidTier = 'buyers_analysis' | 'complete_history';

const TIER_RANK: Record<ReportTier, number> = {
  basic: 0,
  buyers_analysis: 1,
  complete_history: 2,
};

/** True when `a` is the same tier as `b` or a higher one. */
export function tierAtLeast(a: ReportTier, b: ReportTier): boolean {
  return TIER_RANK[a] >= TIER_RANK[b];
}

export interface Recall {
  id: string;
  summary: string;
  component?: string;
}

/** NHTSA NCAP crash-test stars (1–5). Null when NHTSA has no rating on file. */
export interface SafetyRating {
  overall: number;
  front_crash?: number;
  side_crash?: number;
  rollover?: number;
}

/** EPA fuel economy estimates. */
export interface FuelEconomy {
  city_mpg?: number;
  highway_mpg?: number;
  combined_mpg: number;
  annual_fuel_cost?: number;
  co2_gpm?: number;
  fuel_type?: string;
}

/**
 * Free result (tier 1) — vehicle IDENTITY ONLY: "is this the correct vehicle?".
 * Recalls, safety, fuel economy, complaints and value are paid-tier data
 * (Report Tiers v2) and live on the purchased report, not here.
 */
export interface BasicReport {
  vehicle: Vehicle;
  summary?: string;
  /** Transitional always-null key (pre-v2 backend); ignore. */
  estimatedValue?: number | null;
}

/** AI Buy Score — always shown WITH its reason, never a bare number (spec §13). */
export interface BuyScore {
  score: number; // 0–100
  band: 'green' | 'yellow' | 'red';
  reason: string;
}

/** One odometer/mileage observation from available records. */
export interface MileagePoint {
  date: string; // ISO date (YYYY-MM)
  mileage: number;
  source?: string;
}

/** One auction sale record (complete_history tier). */
export interface AuctionRecord {
  date: string;
  location?: string;
  price?: number | null;
  /** Provider photo URLs — served by our backend, may be empty. */
  photoUrls: string[];
}

/** One service/maintenance record — many vehicles have none on file. */
export interface ServiceRecord {
  date: string;
  description: string;
  mileage?: number;
}

/**
 * Buyer's Analysis — "should I buy this vehicle?" (Report Tiers v2, tier 3).
 * Included with both paid tiers. Field list mirrors the tiers PDF: score,
 * recommendation, value/MSRP/depreciation, offer + negotiation, mileage +
 * rollback, maintenance outlook, factory equipment, photos, recalls, TSBs,
 * complaint trends.
 */
export interface BuyersAnalysis {
  buyScore: BuyScore;
  recommendation: string;
  /** Market value — a paid provider call, included with every analysis. */
  estimatedValue?: number | null;
  /** Original MSRP, for depreciation context. */
  msrp?: number | null;
  /** Percent of MSRP lost since new (0–100). */
  depreciationPct?: number | null;
  /** AI-suggested offer to make. */
  suggestedOffer?: number | null;
  negotiationAdvice?: string | null;
  mileageHistory: MileagePoint[];
  rollbackDetected: boolean;
  maintenanceOutlook?: string | null;
  factoryEquipment: string[];
  /** Historical listing/registration photos, when a provider has them. */
  photoUrls: string[];
  openRecalls: Recall[];
  /** Manufacturer communications (TSBs) on file. */
  manufacturerCommunications: number;
  complaintTrends?: string | null;
}

/**
 * Vehicle History — "what happened to this specific VIN?" (Report Tiers v2,
 * tier 4). Only present on the complete_history tier.
 */
export interface VehicleHistory {
  accidents: number;
  /** Salvage / flood / rebuilt etc. — empty means a clean title. */
  titleBrands: string[];
  thefts: number;
  odometerIssues: number;
  owners?: number;
  auctionRecords: AuctionRecord[];
  serviceHistory: ServiceRecord[];
}

/**
 * A purchased report. Always carries the Buyer's Analysis; `history` is
 * populated only for the complete_history tier.
 */
export interface Report {
  vehicle: Vehicle;
  tier: PaidTier;
  analysis: BuyersAnalysis;
  history?: VehicleHistory | null;
}

export function scoreBand(score: number): BuyScore['band'] {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  return 'red';
}
