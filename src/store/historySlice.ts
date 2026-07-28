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
      // Every explicit scan is a new report chain. Only de-dupe a replay of
      // the exact local event id; another scan of the same VIN stays separate.
      state.entries = [action.payload, ...state.entries.filter((e) => e.id !== action.payload.id)];
    },
    /**
     * Record a completed purchase. Only ever upgrades the tier
     * (basic → buyers_analysis → complete_history), never downgrades.
     */
    markPurchased(
      state,
      action: PayloadAction<{
        vin: string;
        tier: PaidTier;
        reportId: string;
        upgradeFromReportId?: string;
      }>,
    ) {
      const entry = action.payload.upgradeFromReportId
        ? state.entries.find((e) => e.reportId === action.payload.upgradeFromReportId)
        : state.entries.find((e) => e.vin === action.payload.vin && e.tier === 'basic')
          ?? state.entries.find((e) => e.vin === action.payload.vin);
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
