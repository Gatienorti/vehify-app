export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  onPrimary: string;
  success: string;
  warning: string;
  danger: string;
  scoreGreen: string;
  scoreYellow: string;
  scoreRed: string;
  premium: string;
  overlay: string;
}

/**
 * Vehify brand palette (from the logo: blue "V" check, "Verify before you buy").
 * brandBlue is the vivid mark blue; brandBlueDeep the royal end of the gradient;
 * brandNavy the wordmark ink. Use brandGradient for the SCAN button and hero CTAs.
 */
export const brand = {
  blue: '#1E63EB',
  blueBright: '#2E7DF6',
  blueDeep: '#1B39B0',
  navy: '#0B1B3B',
} as const;

/** Diagonal brand gradient — pair with start={{x:0,y:0}} end={{x:1,y:1}}. */
export const brandGradient = [brand.blueBright, brand.blueDeep] as const;

export const lightColors: ThemeColors = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F6',
  border: '#E2E6EC',
  text: brand.navy,
  textMuted: '#5C6B80',
  primary: brand.blue,
  primaryText: brand.blue,
  onPrimary: '#FFFFFF',
  success: '#1FB56A',
  warning: '#E0A106',
  danger: '#E5484D',
  scoreGreen: '#1FB56A',
  scoreYellow: '#E0A106',
  scoreRed: '#E5484D',
  premium: brand.blueDeep,
  overlay: 'rgba(0,0,0,0.55)',
};

export const darkColors: ThemeColors = {
  background: '#0B0F16',
  surface: '#141A24',
  surfaceAlt: '#1D2530',
  border: '#28313E',
  text: '#F2F5FA',
  textMuted: '#93A0B4',
  primary: brand.blueBright,
  primaryText: brand.blueBright,
  onPrimary: '#FFFFFF',
  success: '#3DD68C',
  warning: '#F5C518',
  danger: '#FF6369',
  scoreGreen: '#3DD68C',
  scoreYellow: '#F5C518',
  scoreRed: '#FF6369',
  premium: brand.blueBright,
  overlay: 'rgba(0,0,0,0.65)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
