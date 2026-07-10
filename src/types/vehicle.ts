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

export type ReportTier = 'basic' | 'premium';

export interface Recall {
  id: string;
  summary: string;
  component?: string;
}

export interface BasicReport {
  vehicle: Vehicle;
  recalls: Recall[];
  estimatedValue?: number;
  summary?: string;
}

/** AI Buy Score — always shown WITH its reason, never a bare number (spec §13). */
export interface BuyScore {
  score: number; // 0–100
  band: 'green' | 'yellow' | 'red';
  reason: string;
}

export interface PremiumReport {
  vehicle: Vehicle;
  buyScore: BuyScore;
  titleBrands: string[];
  accidents: number;
  thefts: number;
  odometerIssues: number;
  owners?: number;
  recommendation: string;
}

export function scoreBand(score: number): BuyScore['band'] {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  return 'red';
}
