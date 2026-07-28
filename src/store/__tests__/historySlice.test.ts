import reducer, {
  addEntry,
  clearHistory,
  markPurchased,
  setEntries,
} from '../historySlice';
import type { HistoryEntry } from '../../types/history';

const entry = (vin: string): HistoryEntry => ({
  id: `${vin}-1`,
  vin,
  lookupType: 'vin',
  lookedUpAt: '2026-07-10T00:00:00.000Z',
  tier: 'basic',
});

describe('historySlice', () => {
  it('hydrates entries and marks hydrated', () => {
    const state = reducer(undefined, setEntries([entry('A')]));
    expect(state.entries).toHaveLength(1);
    expect(state.hydrated).toBe(true);
  });

  it('keeps repeated scans of the same VIN as separate entries', () => {
    let state = reducer(undefined, addEntry(entry('A')));
    state = reducer(state, addEntry(entry('B')));
    state = reducer(state, addEntry({ ...entry('A'), id: 'A-2' }));
    expect(state.entries.map((e) => e.id)).toEqual(['A-2', 'B-1', 'A-1']);
  });

  it('marks an entry purchased with a tier and report id', () => {
    let state = reducer(undefined, addEntry(entry('A')));
    state = reducer(state, markPurchased({ vin: 'A', tier: 'buyers_analysis', reportId: 'r1' }));
    expect(state.entries[0]).toMatchObject({ tier: 'buyers_analysis', reportId: 'r1' });
  });

  it('upgrades a purchased entry to complete_history', () => {
    let state = reducer(undefined, addEntry(entry('A')));
    state = reducer(state, markPurchased({ vin: 'A', tier: 'buyers_analysis', reportId: 'r1' }));
    state = reducer(state, markPurchased({ vin: 'A', tier: 'complete_history', reportId: 'r2' }));
    expect(state.entries[0]).toMatchObject({ tier: 'complete_history', reportId: 'r2' });
  });

  it('never downgrades a tier — a late lower-tier confirm is ignored', () => {
    let state = reducer(undefined, addEntry(entry('A')));
    state = reducer(state, markPurchased({ vin: 'A', tier: 'complete_history', reportId: 'r2' }));
    state = reducer(state, markPurchased({ vin: 'A', tier: 'buyers_analysis', reportId: 'r1' }));
    expect(state.entries[0]).toMatchObject({ tier: 'complete_history', reportId: 'r2' });
  });

  it('re-scanning a purchased VIN starts a new basic chain', () => {
    let state = reducer(undefined, addEntry(entry('A')));
    state = reducer(state, markPurchased({ vin: 'A', tier: 'buyers_analysis', reportId: 'r1' }));
    state = reducer(state, addEntry({ ...entry('A'), id: 'A-2' }));
    expect(state.entries).toHaveLength(2);
    expect(state.entries[0]).toMatchObject({ id: 'A-2', tier: 'basic' });
    expect(state.entries[1]).toMatchObject({ id: 'A-1', tier: 'buyers_analysis', reportId: 'r1' });
  });

  it('upgrades the exact Buyer chain when the VIN appears more than once', () => {
    let state = reducer(undefined, addEntry(entry('A')));
    state = reducer(state, markPurchased({ vin: 'A', tier: 'buyers_analysis', reportId: 'r1' }));
    state = reducer(state, addEntry({ ...entry('A'), id: 'A-2' }));
    state = reducer(state, markPurchased({ vin: 'A', tier: 'buyers_analysis', reportId: 'r2' }));

    state = reducer(state, markPurchased({
      vin: 'A',
      tier: 'complete_history',
      reportId: 'r3',
      upgradeFromReportId: 'r1',
    }));

    expect(state.entries.find((item) => item.id === 'A-1')).toMatchObject({
      tier: 'complete_history',
      reportId: 'r3',
    });
    expect(state.entries.find((item) => item.id === 'A-2')).toMatchObject({
      tier: 'buyers_analysis',
      reportId: 'r2',
    });
  });

  it('clears history', () => {
    let state = reducer(undefined, addEntry(entry('A')));
    state = reducer(state, clearHistory());
    expect(state.entries).toHaveLength(0);
  });
});
