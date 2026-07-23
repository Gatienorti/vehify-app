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
  /** Extended vPIC identity detail (all free) — null/absent when NHTSA lacks it. */
  displacement?: string;
  cylinders?: number;
  engineConfiguration?: string;
  turbo?: string;
  transmissionSpeeds?: number;
  electrification?: string;
  batteryKwh?: number;
  batteryType?: string;
  plantCountry?: string;
  plantCity?: string;
  series?: string;
  vehicleType?: string;
  gvwrClass?: string;
  wheelbase?: number;
  curbWeight?: number;
  abs?: string;
  /** EPA fuel economy (free) — surfaced on the free basic result too. */
  cityMpg?: number;
  highwayMpg?: number;
}

/** Where a lookup result came from — drives free-refresh rules (spec §9, §10). */
export type LookupSource = 'cache' | 'live';

/**
 * What the user owns for a vehicle (Report Tiers MVP v2):
 *   basic            — Basic Report: free VIN/plate result (verify + identify)
 *   buyers_analysis  — Buyer Report: "should I buy this?" ($1.99)
 *   complete_history — Premium Report: buyers_analysis + full history (+$2.99 = $4.98)
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

export interface OwnershipCostSlice {
  key: string;
  label: string;
  total: number;
}

/** Typical N-year ownership cost — hedged estimate, never a per-VIN promise. */
export interface OwnershipCost {
  years: number;
  milesPerYear: number;
  total: number;
  costPerMile: number;
  /** Depreciation slice present (valuation content — Complete History only). */
  includesDepreciation: boolean;
  /** Insurance basis state (from the plate lookup) — null means U.S. average. */
  state?: string | null;
  slices: OwnershipCostSlice[];
}

/** EPA fuel economy estimates, plus live enrichment when available. */
export interface FuelEconomy {
  city_mpg?: number;
  highway_mpg?: number;
  combined_mpg: number;
  /** EPA's static estimate (their baked-in fuel price assumption). */
  annual_fuel_cost?: number;
  co2_gpm?: number;
  fuel_type?: string;
  /** Driver-reported average ("Your MPG") — only present with 3+ drivers. */
  real_world_mpg?: number | null;
  /** How many drivers shared data behind real_world_mpg. */
  real_world_sample?: number | null;
  /** Annual cost re-priced at this week's national pump price (grade-matched). */
  annual_fuel_cost_current?: number | null;
  gas_price_per_gallon?: number | null;
  /** ISO date of the price week behind annual_fuel_cost_current. */
  gas_price_as_of?: string | null;
  /** EV/PHEV context (null on conventional cars; combined_mpg is MPGe for EVs). */
  electric_range?: number | null;
  /** Hours to charge on a 240V (Level 2) charger. */
  charge_time_240v?: number | null;
  /** EPA alternative-fuel class, e.g. "EV", "Plug-in Hybrid Vehicle". */
  atv_type?: string | null;
}

/**
 * EV/plug-in ownership context (electric vehicles only): purchase incentives
 * for the buyer's jurisdiction and charging density near their ZIP (only when
 * a ZIP was entered at purchase).
 */
export interface EvOwnership {
  incentives: {
    jurisdiction: string;
    count: number;
    highlights: { title: string; type?: string | null }[];
  } | null;
  charging: {
    stationCount: number;
    dcFastCount: number;
    radiusMiles: number;
  } | null;
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
   * Honesty split (valuation move):
   *  - modelScore judges the MODEL's track record (complaints, recalls, TSBs,
   *    federal investigations, crash rating) — present on every NEW report,
   *    but null on some legacy pre-split reports (the backend resource emits
   *    null when analysis.model_score is absent), so renders must guard.
   *  - buyScore judges THIS VIN's records — null until the buyer owns the
   *    Complete Vehicle History (that's the upsell).
   *  - OUR valuation (estimatedValue, valueLow/High, msrp, depreciationPct,
   *    suggestedOffer, negotiationAdvice, valueByMileage) is Premium-only:
   *    absent/null on new Buyer Reports. listingComps stay on BOTH tiers —
   *    raw observed asking prices, not our valuation.
   *  - deal/askingPrice are LEGACY: the asking-price input was removed, so
   *    new reports never carry them — kept so old purchased reports render.
   */
  modelScore: BuyScore | null;
  buyScore?: BuyScore | null;
  /** LEGACY (old reports only) — the deal verdict feature was removed. */
  deal?: {
    verdict: 'good' | 'fair' | 'high' | null;
    priceDelta: number | null;
    reason: string;
  } | null;
  /** LEGACY (old reports only) — the asking-price input was removed. */
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
  /** Market value — Premium only; a paid provider call, single point estimate. */
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
  /** AI-suggested offer to make — Premium only. */
  suggestedOffer?: number | null;
  /** Negotiation advice — Premium only (valuation content). */
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
  /** LEGACY (old reports only) — the odometer input was removed; Premium's valuation mileage comes from history records. */
  buyerMileage?: number | null;
  /**
   * Locally computed value-vs-mileage band around the estimate (Premium
   * only) — shows how mileage moves the price. Centered on the history
   * odometer (or buyerMileage on legacy reports).
   */
  valueByMileage?: { mileage: number; estimate: number }[];
  /**
   * The vendor history report's own retail valuation (Premium only) — a
   * second anchor shown beside estimatedValue, never mixed into the verdict.
   */
  carfaxValue?: { amount: number; label: string } | null;
  /** NHTSA crash-test ratings for this model, when on file. */
  safety?: SafetyRating | null;
  /** EPA fuel economy for this model, when on file. */
  fuelEconomy?: FuelEconomy | null;
  /**
   * Typical 5-year ownership cost (fuel = real EPA×EIA numbers; depreciation =
   * our valuation heuristic, premium only; rest = U.S. typical-cost tables).
   * Absent on legacy reports and the B2B surface.
   */
  ownershipCost?: OwnershipCost | null;
  /** EV/plug-in only — incentives + charging context. Null for gas cars. */
  evOwnership?: EvOwnership | null;
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
    /** Verbatim from the report, e.g. "17 yrs. 10 mo.". */
    lengthOfOwnership?: string | null;
    states?: string[];
    lastReportedOdometer?: number | null;
  }[];
  /**
   * The vendor report's own retail valuation + the history events it says
   * move it. Suppressed by the vendor on branded cars → null.
   */
  historyBasedValue?: {
    amount: number;
    label: string;
    events: { label: string; direction: 'up' | 'down' | null }[];
  } | null;
  /** AutoCheck's 1-100 score vs the typical range for similar vehicles. */
  autocheckScore?: {
    score: number;
    rangeLow: number | null;
    rangeHigh: number | null;
  } | null;
  /** Warranty status blurb, e.g. "Original warranty estimated to have expired." */
  warranty?: string | null;
  /** States/provinces this vehicle was registered in. */
  locations?: string[];
  /** The report's own badges ("CARFAX 1-Owner Vehicle"). */
  highlights?: string[];
  /** Loan/lien events — the lien must be released before a clean transfer. */
  lienRecords?: { date: string; detail: string | null }[];
  /** Per-VIN open-recall flag (model-level recalls live in openRecalls). */
  openRecallReported?: boolean | null;
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
