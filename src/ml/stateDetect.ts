/**
 * Detect a US state from OCR'd plate text: exact state name, fuzzy name
 * (OCR errors), 2-letter code, or a known plate slogan ("EMPIRE STATE" → NY).
 * Pure functions — unit-tested without a device.
 */
import { US_STATES } from '../utils/plate';

/** Plate slogans / nicknames → state code. Uppercase, no punctuation. */
export const STATE_SLOGANS: Record<string, string> = {
  'EMPIRE STATE': 'NY',
  'EXCELSIOR': 'NY',
  'GARDEN STATE': 'NJ',
  'SUNSHINE STATE': 'FL',
  'MYFLORIDA': 'FL',
  'GOLDEN STATE': 'CA',
  'DMV CA GOV': 'CA',
  'LONE STAR STATE': 'TX',
  'FIRST IN FLIGHT': 'NC',
  'FIRST IN FREEDOM': 'NC',
  'LIVE FREE OR DIE': 'NH',
  'FAMOUS POTATOES': 'ID',
  'WILD WONDERFUL': 'WV',
  'SPORTSMANS PARADISE': 'LA',
  'LAND OF LINCOLN': 'IL',
  'LAND OF ENCHANTMENT': 'NM',
  'GRAND CANYON STATE': 'AZ',
  'ALOHA STATE': 'HI',
  'PURE MICHIGAN': 'MI',
  'GREAT LAKES': 'MI',
  'GREEN MOUNTAIN STATE': 'VT',
  'OCEAN STATE': 'RI',
  'CONSTITUTION STATE': 'CT',
  'THE FIRST STATE': 'DE',
  'SHOW ME STATE': 'MO',
  'BLUEGRASS STATE': 'KY',
  'UNBRIDLED SPIRIT': 'KY',
  'VOLUNTEER STATE': 'TN',
  'PEACH STATE': 'GA',
  'SMILING FACES BEAUTIFUL PLACES': 'SC',
  'WHILE I BREATHE I HOPE': 'SC',
  'MOUNT RUSHMORE STATE': 'SD',
  'GREAT FACES GREAT PLACES': 'SD',
  'PEACE GARDEN STATE': 'ND',
  'LEGENDARY': 'ND',
  'BIG SKY': 'MT',
  'TREASURE STATE': 'MT',
  'THE GOOD LIFE': 'NE',
  'HOME MEANS NEVADA': 'NV',
  'GREATEST SNOW ON EARTH': 'UT',
  'LIFE ELEVATED': 'UT',
  'EVERGREEN STATE': 'WA',
  'PACIFIC WONDERLAND': 'OR',
  'AMERICAS DAIRYLAND': 'WI',
  '10000 LAKES': 'MN',
  'EXPLORE MINNESOTA': 'MN',
  'THE NATURAL STATE': 'AR',
  'BIRTHPLACE OF AVIATION': 'OH',
  'CROSSROADS OF AMERICA': 'IN',
  'THE LAST FRONTIER': 'AK',
  'NORTH TO THE FUTURE': 'AK',
  'HEART OF DIXIE': 'AL',
  'SWEET HOME ALABAMA': 'AL',
  'NATIVE AMERICA': 'OK',
  'EXPLORE OKLAHOMA': 'OK',
  'SPIRIT OF AMERICA': 'MA',
  'MARYLAND PROUD': 'MD',
  'KEYSTONE STATE': 'PA',
  'VISITPA': 'PA',
  'TAXATION WITHOUT REPRESENTATION': 'DC',
  'FOREVER WEST': 'WY',
  'VACATIONLAND': 'ME',
  'BIRTHPLACE OF AMERICAS MUSIC': 'MS',
  'TO THE STARS': 'KS',
  'VIRGINIA IS FOR LOVERS': 'VA',
};

const STATE_NAME_TO_CODE = new Map<string, string>(
  US_STATES.map((s) => [s.name.toUpperCase(), s.code]),
);

/**
 * 2-letter codes we accept as standalone words. Codes that are common English
 * words (IN, OR, ME, OK, HI, LA, PA, MA, MO, AL, ID, OH, CO, DE) are excluded
 * — they'd false-positive on frame text and dealer badges.
 */
const AMBIGUOUS_CODES = new Set(['IN', 'OR', 'ME', 'OK', 'HI', 'LA', 'PA', 'MA', 'MO', 'AL', 'ID', 'OH', 'CO', 'DE']);
const SAFE_STATE_CODES = new Set(
  US_STATES.map((s) => s.code).filter((c) => !AMBIGUOUS_CODES.has(c)),
);

export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m: number[][] = [];
  for (let i = 0; i <= a.length; i++) m[i] = [i];
  for (let j = 0; j <= b.length; j++) m[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i]![j] = a[i - 1] === b[j - 1]
        ? m[i - 1]![j - 1]!
        : 1 + Math.min(m[i - 1]![j - 1]!, m[i - 1]![j]!, m[i]![j - 1]!);
    }
  }
  return m[a.length]![b.length]!;
}

function normalizeText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Detect a state from OCR text. Passes, in order of trust:
 * 1. exact state-name match (spaced or concatenated, e.g. "NEWYORK")
 * 2. fuzzy state-name match (Levenshtein ≤ 1–2 for OCR errors)
 * 3. standalone 2-letter code (unambiguous codes only)
 */
export function detectState(text: string): string | null {
  const upper = normalizeText(text);
  if (!upper) return null;
  const noSpaces = upper.replace(/\s/g, '');
  const words = upper.split(' ');

  for (const [name, code] of STATE_NAME_TO_CODE) {
    const concat = name.replace(/\s/g, '');
    if (upper.includes(name) || noSpaces.includes(concat)) return code;
  }

  for (const [name, code] of STATE_NAME_TO_CODE) {
    const target = name.replace(/\s/g, '');
    const maxDist = target.length >= 6 ? 2 : 1;
    for (const word of words) {
      if (word.length < 4) continue;
      if (Math.abs(word.length - target.length) > maxDist) continue;
      if (levenshtein(word, target) <= maxDist) return code;
    }
    for (let i = 0; i < words.length - 1; i++) {
      const pair = words[i]! + words[i + 1]!;
      if (Math.abs(pair.length - target.length) > maxDist) continue;
      if (levenshtein(pair, target) <= maxDist) return code;
    }
  }

  for (const w of words) {
    if (SAFE_STATE_CODES.has(w)) return w;
  }

  return null;
}

/** Detect a state via a known plate slogan (exact, then fuzzy ≤ 2). */
export function detectSlogan(text: string): string | null {
  const upper = normalizeText(text);
  if (!upper) return null;
  const noSpaces = upper.replace(/\s/g, '');
  const words = upper.split(' ');

  for (const [slogan, code] of Object.entries(STATE_SLOGANS)) {
    const concat = slogan.replace(/\s/g, '');
    if (upper.includes(slogan) || noSpaces.includes(concat)) return code;
  }

  for (const [slogan, code] of Object.entries(STATE_SLOGANS)) {
    if (slogan.length < 8) continue; // fuzzy only for long slogans — short ones false-positive
    const sloganWords = slogan.split(' ');
    if (sloganWords.length > words.length) continue;
    for (let i = 0; i <= words.length - sloganWords.length; i++) {
      const window = words.slice(i, i + sloganWords.length).join(' ');
      if (levenshtein(window, slogan) <= 2) return code;
    }
  }

  return null;
}
