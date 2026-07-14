import reducer, {
  recordPurchase,
  setPurchases,
  type PurchaseRecord,
} from '../purchasesSlice';

const record = (vin: string, tier: PurchaseRecord['tier'], reportId = 'r1'): PurchaseRecord => ({
  vin,
  tier,
  reportId,
  productId: 'buyers_analysis',
  purchasedAt: '2026-07-14T00:00:00.000Z',
});

describe('purchasesSlice', () => {
  it('hydrates records and marks hydrated', () => {
    const state = reducer(undefined, setPurchases([record('A', 'buyers_analysis')]));
    expect(state.records).toHaveLength(1);
    expect(state.hydrated).toBe(true);
  });

  it('keeps one record per VIN', () => {
    let state = reducer(undefined, recordPurchase(record('A', 'buyers_analysis')));
    state = reducer(state, recordPurchase(record('B', 'buyers_analysis')));
    state = reducer(state, recordPurchase(record('A', 'buyers_analysis', 'r9')));
    expect(state.records).toHaveLength(2);
    expect(state.records.find((r) => r.vin === 'A')?.reportId).toBe('r9');
  });

  it('upgrades a VIN to complete_history', () => {
    let state = reducer(undefined, recordPurchase(record('A', 'buyers_analysis', 'r1')));
    state = reducer(state, recordPurchase(record('A', 'complete_history', 'r2')));
    expect(state.records[0]).toMatchObject({ tier: 'complete_history', reportId: 'r2' });
  });

  it('never downgrades — a late lower-tier record is ignored', () => {
    let state = reducer(undefined, recordPurchase(record('A', 'complete_history', 'r2')));
    state = reducer(state, recordPurchase(record('A', 'buyers_analysis', 'r1')));
    expect(state.records[0]).toMatchObject({ tier: 'complete_history', reportId: 'r2' });
  });
});
