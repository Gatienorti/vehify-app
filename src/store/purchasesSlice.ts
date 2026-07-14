import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { tierAtLeast, type PaidTier } from '../types/vehicle';

/**
 * A durable record of a bought report. Kept separate from history on purpose:
 * history is a browsing convenience the user may clear; a purchase is money
 * spent and must survive anything short of an uninstall (and later, sync to
 * an account / restore from the store — spec §16).
 */
export interface PurchaseRecord {
  vin: string;
  tier: PaidTier;
  reportId: string;
  productId: string;
  purchasedAt: string; // ISO timestamp
}

interface PurchasesState {
  records: PurchaseRecord[];
  hydrated: boolean;
}

const initialState: PurchasesState = {
  records: [],
  hydrated: false,
};

const purchasesSlice = createSlice({
  name: 'purchases',
  initialState,
  reducers: {
    setPurchases(state, action: PayloadAction<PurchaseRecord[]>) {
      state.records = action.payload;
      state.hydrated = true;
    },
    /**
     * One record per VIN, upgrade-only — an upgrade replaces the record, a
     * late lower-tier confirm is ignored (same rule as history entries).
     */
    recordPurchase(state, action: PayloadAction<PurchaseRecord>) {
      const existing = state.records.find((r) => r.vin === action.payload.vin);
      if (existing && !tierAtLeast(action.payload.tier, existing.tier)) return;
      state.records = [
        action.payload,
        ...state.records.filter((r) => r.vin !== action.payload.vin),
      ];
    },
  },
});

export const { setPurchases, recordPurchase } = purchasesSlice.actions;
export default purchasesSlice.reducer;
