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
  /** Numeric specs (free from NHTSA vPIC) — absent when the decode lacks them. */
  horsepower?: number;
  doors?: number;
  seats?: number;
}

/** Where a lookup result came from — drives free-refresh rules (spec §9, §10). */
export type LookupSource = 'cache' | 'live';

/**
 * What the user owns for a vehicle (Report Tiers MVP v2):
 *   basic            — Basic Report: free VIN/plate result (verify + identify)
 *   buyers_analysis  — Buyer Report: "should I buy this?" ($1.99 / $1.74)
 *   complete_history — Premium Report: buyers_analysis + full history (+$3 = $4.99)
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
 * recommendation, market value (a single point estimate), MSRP + depreciation
 * when the free trims dataset covers the trim (~2015–2020, else null), offer +
 * negotiation, mileage + rollback, maintenance outlook, factory equipment,
 * photos, recalls, TSBs, complaint trends.
 */
export interface BuyersAnalysis {
  /**
   * Model & Deal honesty split (Report Tiers v2.1):
   *  - modelScore judges the MODEL's track record (complaints, recalls, TSBs,
   *    federal investigations, crash rating) — always present.
   *  - buyScore judges THIS VIN's records — null until the buyer owns the
   *    Complete Vehicle History (that's the upsell).
   */
  modelScore: BuyScore;
  buyScore?: BuyScore | null;
  /** Asking price vs market value at the entered mileage. verdict null without askingPrice. */
  deal?: {
    verdict: 'good' | 'fair' | 'high' | null;
    priceDelta: number | null;
    reason: string;
  } | null;
  /** The asking price the buyer entered at purchase (dollars). */
  askingPrice?: number | null;
  /** NHTSA defect investigations into this model — open ones are the red flag. */
  investigations?: {
    total: number;
    open: number;
    items: {
      actionNumber: string;
      subject: string | null;
      component: string | null;
      openedAt: string | null;
      closedAt: string | null;
      isOpen: boolean;
      recallCampaign: string | null;
    }[];
  } | null;
  recommendation: string;
  /** Market value — a paid provider call, a single point estimate. */
  estimatedValue?: number | null;
  /**
   * Estimated uncertainty band around the point estimate (±%). NOT a set of
   * observed comps — it's modeled from `estimatedValue`, so the UI must label
   * it as an estimate, never as sourced market data.
   */
  valueLow?: number | null;
  valueHigh?: number | null;
  /**
   * Original MSRP (sticker) for the matched trim — REAL data from the free
   * carapi.app trims dataset, per-trim, roughly model years 2015–2020; null
   * outside that coverage. A checkable dollar claim, so only render when present.
   */
  msrp?: number | null;
  /** Percent of MSRP lost since new (0–100), derived from msrp vs estimate. */
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
  /**
   * Recent asking prices for comparable cars (negotiation color) — an
   * accumulating pool refreshed every few days (older points age out at
   * ~60 days), each stamped with the date it was seen so nothing pretends
   * to be more current than it is. Vendor-neutral: never name the
   * marketplace source anywhere in the UI.
   */
  listingComps?: {
    count: number;
    low: number;
    high: number;
    average: number;
    /** ISO date of the newest data point in the pool. */
    asOf?: string | null;
    items: {
      title: string;
      price: number;
      /** Listed odometer reading (miles), when the listing declared one. */
      mileage?: number | null;
      /** Title status as listed (e.g. "Clean") — branded titles are filtered out upstream. */
      titleStatus?: string | null;
      /** ISO date this asking price was observed. */
      seenAt?: string | null;
      url: string | null;
    }[];
  } | null;
  /** The odometer reading the buyer entered at purchase (miles). */
  buyerMileage?: number | null;
  /**
   * Locally computed value-vs-mileage band around the estimate — shows how
   * mileage moves the price (negotiation ammo). Centered on buyerMileage.
   */
  valueByMileage?: { mileage: number; estimate: number }[];
  /** NHTSA crash-test ratings for this model, when on file. */
  safety?: SafetyRating | null;
  /** EPA fuel economy for this model, when on file. */
  fuelEconomy?: FuelEconomy | null;
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
  /** The report's own findings grid ("Severe Damage", "Warranty Voided"…). */
  conditionFlags?: {
    finding: string;
    severity: 'Alert' | 'Warning' | 'Normal' | null;
    note: string | null;
    ownerGroup: number | null;
  }[];
  /** Per-owner profile — usage type only, never a person's identity (DPPA). */
  ownerDetails?: {
    owner: number | null;
    purchasedYear: number | null;
    type: string | null;
    milesPerYear: number | null;
    events: number | null;
  }[];
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
