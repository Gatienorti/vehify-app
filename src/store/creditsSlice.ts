import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Device-local memory of whether this user has EVER held report credits.
 * Balance itself is server-authoritative (RTK Query, `getCredits`) — this only
 * remembers the "ever held" bit so the "Credits: 0" chip keeps showing for a
 * returning credit-buyer whose balance hit zero, while staying invisible to the
 * vast majority who never touch credits. Persisted to AsyncStorage.
 */
export interface CreditsState {
  everHeld: boolean;
}

const initialState: CreditsState = {
  everHeld: false,
};

const creditsSlice = createSlice({
  name: 'credits',
  initialState,
  reducers: {
    setCredits(_state, action: PayloadAction<CreditsState>) {
      return action.payload;
    },
    /** Flip once a positive balance has been observed — never flips back. */
    markCreditsHeld(state) {
      state.everHeld = true;
    },
  },
});

export const { setCredits, markCreditsHeld } = creditsSlice.actions;
export default creditsSlice.reducer;
