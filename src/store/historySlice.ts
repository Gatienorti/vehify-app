import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { HistoryEntry } from '../types/history';

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
      // De-dupe on VIN — keep the most recent lookup at the top.
      state.entries = [
        action.payload,
        ...state.entries.filter((e) => e.vin !== action.payload.vin),
      ];
    },
    markPremium(state, action: PayloadAction<{ vin: string; reportId: string }>) {
      const entry = state.entries.find((e) => e.vin === action.payload.vin);
      if (entry) {
        entry.tier = 'premium';
        entry.reportId = action.payload.reportId;
      }
    },
    clearHistory(state) {
      state.entries = [];
    },
  },
});

export const { setEntries, addEntry, markPremium, clearHistory } = historySlice.actions;
export default historySlice.reducer;
