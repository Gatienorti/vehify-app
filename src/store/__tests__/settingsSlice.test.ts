import reducer, {
  setSettings,
  setThemePreference,
  type SettingsState,
} from '../settingsSlice';

const initial: SettingsState = { themePreference: null };

describe('settingsSlice', () => {
  it('defaults to no preference (renders light mode)', () => {
    expect(reducer(undefined, { type: 'noop' })).toEqual(initial);
  });

  it('sets an explicit theme preference', () => {
    const dark = reducer(initial, setThemePreference('dark'));
    expect(dark.themePreference).toBe('dark');
    const light = reducer(dark, setThemePreference('light'));
    expect(light.themePreference).toBe('light');
  });

  it('hydrates from persisted settings', () => {
    const state = reducer(initial, setSettings({ themePreference: 'dark' }));
    expect(state.themePreference).toBe('dark');
  });
});
