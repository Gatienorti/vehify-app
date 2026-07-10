import reducer, {
  addEntry,
  clearHistory,
  markPremium,
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

  it('de-dupes on VIN, newest first', () => {
    let state = reducer(undefined, addEntry(entry('A')));
    state = reducer(state, addEntry(entry('B')));
    state = reducer(state, addEntry(entry('A')));
    expect(state.entries.map((e) => e.vin)).toEqual(['A', 'B']);
  });

  it('marks an entry premium with a report id', () => {
    let state = reducer(undefined, addEntry(entry('A')));
    state = reducer(state, markPremium({ vin: 'A', reportId: 'r1' }));
    expect(state.entries[0]).toMatchObject({ tier: 'premium', reportId: 'r1' });
  });

  it('clears history', () => {
    let state = reducer(undefined, addEntry(entry('A')));
    state = reducer(state, clearHistory());
    expect(state.entries).toHaveLength(0);
  });
});
