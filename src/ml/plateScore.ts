/**
 * Find the most plate-like token in ML Kit OCR output. Pure logic —
 * unit-tested; ML Kit block shapes are structural so tests don't need the lib.
 */
import { US_STATES } from '../utils/plate';
import { STATE_SLOGANS } from './stateDetect';

export interface OcrBounding {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrLineLike {
  text: string;
  bounding: OcrBounding;
}

export interface OcrBlockLike {
  text: string;
  bounding: OcrBounding;
  lines?: OcrLineLike[];
}

export interface PlateCandidate {
  text: string;
  score: number;
  region: OcrBounding;
}

/** Score a cleaned string on how plate-like it is (0 = not a plate). */
export function scorePlateText(text: string): number {
  const c = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 5 || c.length > 8) return 0;

  let score = 4;
  const hasLetter = /[A-Z]/.test(c);
  const hasDigit = /[0-9]/.test(c);
  if (hasLetter && hasDigit) score += 3;

  if (/^[A-Z]{2,3}[0-9]{3,4}$/.test(c)) score += 5; // ABC1234
  if (/^[0-9]{3,4}[A-Z]{2,3}$/.test(c)) score += 5; // 1234ABC
  if (/^[0-9][A-Z]{3}[0-9]{3}$/.test(c)) score += 5; // 1ABC234 (CA)
  if (/^[A-Z][0-9]{2,3}[A-Z]{3}$/.test(c)) score += 4; // A12BCD

  return score;
}

// Words/substrings that are state branding, not the plate number.
const FILTER_WORDS = new Set<string>();
const FILTER_SUBSTRINGS: string[] = [];
for (const s of US_STATES) {
  for (const part of s.name.toUpperCase().split(' ')) FILTER_WORDS.add(part);
  const concat = s.name.toUpperCase().replace(/\s/g, '');
  if (concat.length >= 5) FILTER_SUBSTRINGS.push(concat);
}
for (const slogan of Object.keys(STATE_SLOGANS)) {
  for (const word of slogan.split(' ')) {
    if (word.length >= 4) FILTER_WORDS.add(word);
  }
  const concat = slogan.replace(/\s/g, '');
  if (concat.length >= 5) FILTER_SUBSTRINGS.push(concat);
}

export function isStateText(cleaned: string): boolean {
  if (FILTER_WORDS.has(cleaned)) return true;
  return FILTER_SUBSTRINGS.some((s) => cleaned.includes(s));
}

type Token = { text: string; region: OcrBounding };

function extractTokens(blocks: OcrBlockLike[]): Token[] {
  const tokens: Token[] = [];
  for (const block of blocks) {
    if (block.lines && block.lines.length > 0) {
      for (const line of block.lines) {
        for (const part of line.text.split(/\s+/)) {
          if (part.length > 0) tokens.push({ text: part, region: line.bounding });
        }
      }
    } else {
      for (const part of block.text.split(/[\n\r\s]+/)) {
        if (part.length > 0) tokens.push({ text: part, region: block.bounding });
      }
    }
  }
  return tokens;
}

/**
 * Best plate candidate in a set of OCR blocks, or null. Tries single tokens
 * and adjacent-token joins ("LXE" + "1867" → "LXE1867"); drops state branding
 * text unless nothing else qualifies.
 */
export function findPlateInBlocks(blocks: OcrBlockLike[]): PlateCandidate | null {
  const tokens = extractTokens(blocks);
  const candidates: PlateCandidate[] = [];

  const push = (raw: string, region: OcrBounding) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const score = scorePlateText(cleaned);
    if (score > 0) candidates.push({ text: cleaned, score, region });
  };

  for (const token of tokens) push(token.text, token.region);
  for (let i = 0; i < tokens.length - 1; i++) {
    push(tokens[i]!.text + tokens[i + 1]!.text, tokens[i]!.region);
  }

  const filtered = candidates.filter((c) => !isStateText(c.text));
  const pool = filtered.length > 0 ? filtered : candidates;
  pool.sort((a, b) => b.score - a.score);

  const best = pool[0];
  return best && best.score >= 4 ? best : null;
}
