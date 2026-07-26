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

type Token = { text: string; region: OcrBounding; group: number; order: number };

function extractTokens(blocks: OcrBlockLike[]): Token[] {
  const tokens: Token[] = [];
  let group = 0;
  let order = 0;
  for (const block of blocks) {
    if (block.lines && block.lines.length > 0) {
      for (const line of block.lines) {
        for (const part of line.text.split(/\s+/)) {
          if (part.length > 0) tokens.push({ text: part, region: line.bounding, group, order: order++ });
        }
        group++;
      }
    } else {
      for (const rawLine of block.text.split(/[\n\r]+/)) {
        for (const part of rawLine.split(/\s+/)) {
          if (part.length > 0) tokens.push({ text: part, region: block.bounding, group, order: order++ });
        }
        group++;
      }
    }
  }
  return tokens;
}

function unionRegion(a: OcrBounding, b: OcrBounding): OcrBounding {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.left + a.width, b.left + b.width);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  return { left, top, width: right - left, height: bottom - top };
}

function horizontallyAdjacent(a: Token, b: Token): boolean {
  const aCenterY = a.region.top + a.region.height / 2;
  const bCenterY = b.region.top + b.region.height / 2;
  const maxHeight = Math.max(a.region.height, b.region.height);
  if (Math.abs(aCenterY - bCenterY) > maxHeight * 0.55) return false;

  const left = a.region.left <= b.region.left ? a : b;
  const right = left === a ? b : a;
  const gap = right.region.left - (left.region.left + left.region.width);
  // Allow a modest overlap (OCR boxes are noisy) and a large visual space like
  // Idaho's "8B  AC392", but never join distant text elsewhere in the frame.
  return gap >= -maxHeight * 0.35 && gap <= maxHeight * 2.5;
}

/**
 * Best plate candidate in a set of OCR blocks, or null. Tries single tokens
 * and same-row joins ("8B" + "AC392" → "8BAC392"), even when ML Kit returns
 * right-hand blocks first. Joined candidates use the union crop region so the
 * later tight OCR passes retain the whole plate.
 */
export function findPlateInBlocks(blocks: OcrBlockLike[]): PlateCandidate | null {
  const tokens = extractTokens(blocks);
  const candidates: PlateCandidate[] = [];

  const push = (raw: string, region: OcrBounding, bonus = 0) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const score = scorePlateText(cleaned);
    if (score > 0) candidates.push({ text: cleaned, score: score + bonus, region });
  };

  // ML Kit often returns a spaced serial as one block but separate line/token
  // pieces ("8R AC392"). Preserve the whole block as a candidate before
  // considering fragments; scorePlateText removes the visual whitespace.
  for (const block of blocks) {
    // When ML Kit intentionally grouped multiple spaced pieces into one
    // plate-sized block, favor that complete region over a high-scoring suffix
    // such as AC392. Non-plate slogans remain outside the 5–8 char score gate.
    const pieces = block.text.trim().split(/\s+/).filter(Boolean);
    push(block.text, block.bounding, pieces.length >= 2 ? 6 : 0);
  }
  for (const token of tokens) push(token.text, token.region);
  for (let i = 0; i < tokens.length - 1; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const a = tokens[i]!;
      const b = tokens[j]!;
      if (a.group === b.group) {
        const ordered = a.order <= b.order ? [a, b] : [b, a];
        push(ordered[0].text + ordered[1].text, unionRegion(a.region, b.region));
      } else if (horizontallyAdjacent(a, b)) {
        const ordered = a.region.left <= b.region.left ? [a, b] : [b, a];
        push(ordered[0].text + ordered[1].text, unionRegion(a.region, b.region));
      }
    }
  }

  const filtered = candidates.filter((c) => !isStateText(c.text));
  const pool = filtered.length > 0 ? filtered : candidates;
  pool.sort(
    (a, b) =>
      b.score - a.score ||
      b.text.length - a.text.length ||
      b.region.width - a.region.width,
  );

  const best = pool[0];
  return best && best.score >= 4 ? best : null;
}
