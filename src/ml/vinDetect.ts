import type { OcrBlockLike } from './plateScore';
import { hasValidCheckDigit, isValidVin } from '../utils/vin';

/** Correct the characters ML Kit most often confuses in printed VIN text. */
function normalizeOcrVin(text: string): string {
  return text.toUpperCase().replace(/I/g, '1').replace(/[OQ]/g, '0');
}

function validCandidate(text: string): string | null {
  const candidate = normalizeOcrVin(text);
  return candidate.length === 17 && isValidVin(candidate) && hasValidCheckDigit(candidate)
    ? candidate
    : null;
}

/**
 * Find a checksum-valid printed VIN without searching arbitrary 17-character
 * windows. Exact tokens are accepted anywhere. Split chunks are joined only
 * when the OCR line explicitly labels the value as VIN, keeping dense
 * registration/document text from manufacturing checksum-lucky candidates.
 */
export function findVinInOcrBlocks(blocks: OcrBlockLike[]): string | null {
  for (const block of blocks) {
    const lines = block.lines?.length ? block.lines.map((line) => line.text) : block.text.split('\n');

    for (const rawLine of lines) {
      const exactTokens = rawLine.split(/[^A-Z0-9]+/i).filter(Boolean);
      for (const token of exactTokens) {
        const candidate = validCandidate(token);
        if (candidate) return candidate;
      }

      // OCR sometimes reads the label's I as 1. The label is required before
      // joining chunks because arbitrary joins recreate the old false-positive
      // problem on document text.
      const label = /\bV(?:I|1)N\b/i.exec(rawLine);
      if (!label) continue;

      const afterLabel = rawLine
        .slice(label.index + label[0].length)
        .replace(/^\s*(?:(?:NO|NUMBER)\s*)?[:#-]?\s*/i, '');
      const joined = afterLabel
        .split(/[^A-Z0-9]+/i)
        .filter(Boolean)
        .join('');
      const candidate = validCandidate(joined);
      if (candidate) return candidate;
    }
  }

  return null;
}
