import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** The signed-in account (accounts are optional — the app works anonymously). */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

export interface AuthState {
  /** Sanctum bearer token; null when signed out. Sent as Authorization: Bearer. */
  token: string | null;
  user: AuthUser | null;
  /** True once we've read (or failed to read) the persisted session on boot. */
  hydrated: boolean;
}

const initialState: AuthState = {
  token: null,
  user: null,
  hydrated: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Seed from SecureStore on boot (also flips `hydrated` for gating UI). */
    hydrateAuth(state, action: PayloadAction<{ token: string; user: AuthUser } | null>) {
      state.hydrated = true;
      if (action.payload) {
        state.token = action.payload.token;
        state.user = action.payload.user;
      }
    },
    /** A successful sign-in (social today; email later reuses this). */
    setAuth(state, action: PayloadAction<{ token: string; user: AuthUser }>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
    },
    /** Sign out — clears the local session (server token revoked separately). */
    clearAuth(state) {
      state.token = null;
      state.user = null;
    },
  },
});

export const { hydrateAuth, setAuth, clearAuth } = authSlice.actions;
export default authSlice.reducer;
