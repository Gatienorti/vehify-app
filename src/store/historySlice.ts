import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { HistoryEntry } from '../types/history';
import { tierAtLeast, type PaidTier } from '../types/vehicle';

interface HistoryState {
  entries: HistoryEntry[];
  hydrated: boolean;
}

const initialState: HistoryState = {
  entries: [],
  hydrated: false,
};

const historySlice = createSlice({
  name: 'history',
  initialState,
  reducers: {
    setEntries(state, action: PayloadAction<HistoryEntry[]>) {
      state.entries = action.payload;
      state.hydrated = true;
    },
    addEntry(state, action: PayloadAction<HistoryEntry>) {
      // De-dupe on VIN — keep the most recent lookup at the top. A re-scan
      // must never erase a purchase: carry the higher tier + reportId over
      // from the entry being replaced.
      const existing = state.entries.find((e) => e.vin === action.payload.vin);
      const entry = { ...action.payload };
      if (existing && !tierAtLeast(entry.tier, existing.tier)) {
        entry.tier = existing.tier;
        entry.reportId = existing.reportId;
      }
      state.entries = [entry, ...state.entries.filter((e) => e.vin !== entry.vin)];
    },
    /**
     * Record a completed purchase. Only ever upgrades the tier
     * (basic → buyers_analysis → complete_history), never downgrades.
     */
    markPurchased(
      state,
      action: PayloadAction<{ vin: string; tier: PaidTier; reportId: string }>,
    ) {
      const entry = state.entries.find((e) => e.vin === action.payload.vin);
      // Same-tier re-confirm (e.g. restore) may refresh the reportId; a
      // lower tier arriving late must not clobber a higher one.
      if (entry && tierAtLeast(action.payload.tier, entry.tier)) {
        entry.tier = action.payload.tier;
        entry.reportId = action.payload.reportId;
      }
    },
    clearHistory(state) {
      state.entries = [];
    },
  },
});

export const { setEntries, addEntry, markPurchased, clearHistory } = historySlice.actions;
export default historySlice.reducer;
