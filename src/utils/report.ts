import type { BuyersAnalysis } from '../types/vehicle';

export type DealVerdict = NonNullable<BuyersAnalysis['deal']>['verdict'];

/** Short display label per deal verdict; null verdict = no asking price entered. */
export function dealVerdictLabel(verdict: DealVerdict): string {
  switch (verdict) {
    case 'good':
      return 'Good deal';
    case 'fair':
      return 'Fair price';
    case 'high':
      return 'Priced high';
    default:
      return 'No verdict';
  }
}

/** "±$X" price delta vs market, e.g. 1400 → "+$1,400", -800 → "−$800". */
export function formatPriceDelta(delta: number): string {
  const abs = Math.abs(delta).toLocaleString('en-US');
  if (delta > 0) return `+$${abs}`;
  if (delta < 0) return `−$${abs}`;
  return '$0';
}

/**
 * Bar width (0–100%) for a value-vs-mileage row, proportional to the largest
 * estimate in the curve — keeps bars comparable within one report.
 */
export function valueBarWidthPct(
  points: { mileage: number; estimate: number }[],
  estimate: number,
): number {
  const max = Math.max(...points.map((p) => p.estimate));
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((estimate / max) * 100)));
}

/** "SPARE TIRE WINCH CABLE" → "Spare tire winch cable" (NHTSA shouts). */
export function sentenceCase(text: string): string {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * NHTSA's colon taxonomy → a human headline:
 * "AIR BAGS:FRONTAL:PASSENGER SIDE:INFLATOR MODULE"
 *   → "Air bags — frontal, passenger side, inflator module".
 */
export function recallComponentLabel(component: string): string {
  const parts = component
    .split(':')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  const head = sentenceCase(parts[0]);
  if (parts.length === 1) return head;
  return `${head} — ${parts
    .slice(1)
    .map((p) => p.toLowerCase())
    .join(', ')}`;
}

/** "2026-07-16" → "Jul 16" — compact seen-date for comp rows. */
export function shortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Index of the curve point closest to the buyer's entered mileage. */
export function nearestMileageIndex(
  points: { mileage: number; estimate: number }[],
  buyerMileage: number | null | undefined,
): number {
  if (buyerMileage == null || points.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i].mileage - buyerMileage) < Math.abs(points[best].mileage - buyerMileage)) {
      best = i;
    }
  }
  return best;
}
