/**
 * Extract a valid VIN from ML Kit OCR blocks.
 *
 * Two guards keep plate/branding text from masquerading as a VIN:
 *  1. PER-LINE ONLY — a real VIN is printed as one contiguous line. We never
 *     concatenate text across lines/blocks ("TEXAS" + "BC5X489" + "TEXAS"
 *     stitched together is exactly 17 chars — a real false positive we hit).
 *  2. CHECK DIGIT — every US/Canada VIN carries an ISO 3779 checksum at
 *     position 9; random 17-char runs fail it ~10/11 of the time.
 *
 * Handles two label layouts:
 *   1. Door-jamb line with "VIN: 5YJ3E1EA3PF6XXXXX".
 *   2. A line that is (mostly) the bare 17-char VIN, with common OCR
 *      substitutions I→1, O→0, L→1 corrected first.
 */
import { extractVinFromBarcode, hasValidCheckDigit } from '../utils/vin';
import type { OcrBlockLike } from './plateScore';

const OCR_CORRECTIONS: [RegExp, string][] = [
  [/O/g, '0'], // O and 0 look identical in many plate/label fonts
  [/I/g, '1'], // I, l, 1 confusion
  [/L/g, '1'], // L→1 on some fonts
];

function applyOcrCorrections(s: string): string {
  let out = s.toUpperCase();
  for (const [from, to] of OCR_CORRECTIONS) out = out.replace(from, to);
  return out;
}

/** Valid 17-char VIN with a correct check digit, or null. */
function tryVin(raw: string): string | null {
  const corrected = applyOcrCorrections(raw.replace(/[\s\-]/g, ''));
  const vin = extractVinFromBarcode(corrected);
  return vin && hasValidCheckDigit(vin) ? vin : null;
}

export function findVinInBlocks(blocks: OcrBlockLike[]): string | null {
  // Collect individual lines — never joined, per guard 1 above.
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.lines && block.lines.length > 0) {
      for (const line of block.lines) lines.push(line.text);
    } else {
      lines.push(...block.text.split(/[\n\r]+/));
    }
  }

  // Pass 1: a line with an explicit "VIN" label prefix.
  for (const line of lines) {
    const m = line.match(/VIN[\s:.#]*([A-Za-z0-9\s\-]{15,25})/i);
    if (m) {
      const v = tryVin(m[1]!);
      if (v) return v;
    }
  }

  // Pass 2: a line that IS the VIN (spaces/dashes inside collapsed — OCR
  // sometimes splits it with a stray space). The line must be essentially
  // just the 17 chars: dense documents (registration cards, insurance slips)
  // produce long merged lines where a random 17-char window passes the
  // check digit ~1/11 of the time — never window-scan those.
  const MAX_BARE_VIN_LINE = 20; // 17 + small slack for stray punctuation
  for (const line of lines) {
    const compact = applyOcrCorrections(line.replace(/[\s\-]/g, ''));
    if (compact.length > MAX_BARE_VIN_LINE) continue;
    const runs = compact.match(/[A-HJ-NPR-Z0-9]{17}/g) ?? [];
    for (const run of runs) {
      const v = extractVinFromBarcode(run);
      if (v && hasValidCheckDigit(v)) return v;
    }
  }

  return null;
}
