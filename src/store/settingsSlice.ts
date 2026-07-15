import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Device-local app settings — cached on the phone (AsyncStorage), never synced
 * to the backend. `themePreference` null means "never set" and renders LIGHT;
 * it becomes an explicit 'light' | 'dark' when the user touches the toggle.
 */
export type ThemePreference = 'light' | 'dark';

export interface SettingsState {
  themePreference: ThemePreference | null;
}

const initialState: SettingsState = {
  themePreference: null,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setSettings(_state, action: PayloadAction<SettingsState>) {
      return action.payload;
    },
    setThemePreference(state, action: PayloadAction<ThemePreference>) {
      state.themePreference = action.payload;
    },
  },
});

export const { setSettings, setThemePreference } = settingsSlice.actions;
export default settingsSlice.reducer;
