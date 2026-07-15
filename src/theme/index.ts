import React, { createContext, useContext, useMemo } from 'react';
import { useAppSelector } from '../store/hooks';
import { darkColors, lightColors, radius, spacing, type ThemeColors } from './colors';

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
  spacing: typeof spacing;
  radius: typeof radius;
}

const ThemeContext = createContext<Theme | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Device-local preference (Account → Dark mode toggle), cached on the phone
  // only. Defaults to LIGHT until the user flips the toggle — the app never
  // follows the OS scheme.
  const preference = useAppSelector((s) => s.settings.themePreference);
  const isDark = preference === 'dark';
  const value = useMemo<Theme>(
    () => ({ colors: isDark ? darkColors : lightColors, isDark, spacing, radius }),
    [isDark],
  );
  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

export { spacing, radius } from './colors';
export type { ThemeColors } from './colors';
