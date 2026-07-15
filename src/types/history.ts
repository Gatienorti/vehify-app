import type { ReportTier } from './vehicle';

/** A locally-stored lookup — persisted before any login (spec §14). */
export interface HistoryEntry {
  id: string;
  vin: string;
  plate?: string;
  state?: string;
  lookupType: 'vin' | 'plate';
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  lookedUpAt: string; // ISO timestamp
  tier: ReportTier;
  reportId?: string;
}
