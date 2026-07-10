import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, radius, spacing, type ThemeColors } from './colors';

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
  spacing: typeof spacing;
  radius: typeof radius;
}

const ThemeContext = createContext<Theme | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
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
