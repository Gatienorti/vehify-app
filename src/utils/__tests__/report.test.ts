import {
  dealVerdictLabel,
  formatPriceDelta,
  nearestMileageIndex,
  valueBarWidthPct,
} from '../report';

describe('dealVerdictLabel', () => {
  it('labels each verdict', () => {
    expect(dealVerdictLabel('good')).toBe('Good deal');
    expect(dealVerdictLabel('fair')).toBe('Fair price');
    expect(dealVerdictLabel('high')).toBe('Priced high');
  });

  it('handles a null verdict (no asking price entered)', () => {
    expect(dealVerdictLabel(null)).toBe('No verdict');
  });
});

describe('formatPriceDelta', () => {
  it('formats over-market as +$', () => {
    expect(formatPriceDelta(1400)).toBe('+$1,400');
  });

  it('formats under-market with a minus sign', () => {
    expect(formatPriceDelta(-800)).toBe('−$800');
  });

  it('formats an exact-market delta', () => {
    expect(formatPriceDelta(0)).toBe('$0');
  });
});

describe('valueBarWidthPct', () => {
  const curve = [
    { mileage: 40000, estimate: 20000 },
    { mileage: 80000, estimate: 15000 },
    { mileage: 120000, estimate: 10000 },
  ];

  it('gives the max estimate a full bar', () => {
    expect(valueBarWidthPct(curve, 20000)).toBe(100);
  });

  it('scales other estimates proportionally', () => {
    expect(valueBarWidthPct(curve, 15000)).toBe(75);
    expect(valueBarWidthPct(curve, 10000)).toBe(50);
  });

  it('returns 0 for a degenerate curve', () => {
    expect(valueBarWidthPct([], 10000)).toBe(0);
    expect(valueBarWidthPct([{ mileage: 1, estimate: 0 }], 0)).toBe(0);
  });
});

describe('nearestMileageIndex', () => {
  const curve = [
    { mileage: 40000, estimate: 20000 },
    { mileage: 80000, estimate: 15000 },
    { mileage: 120000, estimate: 10000 },
  ];

  it('finds the closest point to the buyer mileage', () => {
    expect(nearestMileageIndex(curve, 78200)).toBe(1);
    expect(nearestMileageIndex(curve, 130000)).toBe(2);
  });

  it('returns -1 without a buyer mileage or points', () => {
    expect(nearestMileageIndex(curve, null)).toBe(-1);
    expect(nearestMileageIndex(curve, undefined)).toBe(-1);
    expect(nearestMileageIndex([], 50000)).toBe(-1);
  });
});
