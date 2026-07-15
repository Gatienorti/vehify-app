import AsyncStorage from '@react-native-async-storage/async-storage';
import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../../store';
import {
  setSettings,
  setThemePreference,
  type SettingsState,
} from '../../store/settingsSlice';

const STORAGE_KEY = 'vehify.settings.v1';

/** Load device-local settings (theme preference) — phone-only, never backend. */
export async function hydrateSettings(dispatch: AppDispatch): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) dispatch(setSettings(JSON.parse(raw) as SettingsState));
  } catch {
    // fall through to defaults (follow the OS theme)
  }
}

/** Persist settings to disk whenever they change. */
export const settingsPersistenceMiddleware = createListenerMiddleware();
settingsPersistenceMiddleware.startListening({
  matcher: isAnyOf(setThemePreference),
  effect: async (_action, listenerApi) => {
    const state = listenerApi.getState() as RootState;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
    } catch {
      // best-effort; a failed write shouldn't crash the app
    }
  },
});
