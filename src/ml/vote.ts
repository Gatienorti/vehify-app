/**
 * Per-character consensus voting across multiple OCR reads of the same plate
 * (the multi-pass "weight every letter one by one, choose the winner" step).
 */

export interface VoteResult {
  plate: string;
  /** Mean per-character agreement, 0–100. */
  confidence: number;
  /** Weakest character's agreement, 0–100. */
  minCharPct: number;
  /** Reads of the dominant length that participated in the vote. */
  reads: number;
}

/** Letter → the digit it's commonly misread from on plate fonts. */
const DIGIT_TWINS: Record<string, string> = { Z: '2', S: '5', B: '8', G: '6' };

export function voteOnReads(
  allReads: string[],
  opts: { preferDigitTwins?: boolean } = {},
): VoteResult | null {
  if (allReads.length === 0) return null;

  // Majority length wins; ties break toward the longer read.
  const lengthCounts = new Map<number, number>();
  for (const p of allReads) {
    lengthCounts.set(p.length, (lengthCounts.get(p.length) ?? 0) + 1);
  }
  let bestLen = 0;
  let bestLenCount = 0;
  for (const [len, count] of lengthCounts) {
    if (count > bestLenCount || (count === bestLenCount && len > bestLen)) {
      bestLen = len;
      bestLenCount = count;
    }
  }

  const sameLen = allReads.filter((p) => p.length === bestLen);
  let plate = '';
  const charPcts: number[] = [];

  for (let pos = 0; pos < bestLen; pos++) {
    const charCounts = new Map<string, number>();
    for (const p of sameLen) {
      const ch = p[pos]!;
      charCounts.set(ch, (charCounts.get(ch) ?? 0) + 1);
    }
    let bestChar = '';
    let bestCharCount = 0;
    for (const [ch, count] of charCounts) {
      if (count > bestCharCount) {
        bestChar = ch;
        bestCharCount = count;
      }
    }
    // Stylized plate fonts make digits OCR as letters systematically (2→Z,
    // 5→S, 8→B, 6→G), so the letter can win the raw count in every photo.
    // The reverse misread (real Z read as 2) is rare — if any read saw the
    // digit twin at this position, trust the digit and pool the votes.
    const twin = DIGIT_TWINS[bestChar];
    if (opts.preferDigitTwins !== false && twin !== undefined && charCounts.has(twin)) {
      bestCharCount += charCounts.get(twin)!;
      bestChar = twin;
    }
    plate += bestChar;
    charPcts.push(Math.round((bestCharCount / sameLen.length) * 100));
  }

  return {
    plate,
    confidence: Math.round(charPcts.reduce((a, b) => a + b, 0) / bestLen),
    minCharPct: Math.min(...charPcts),
    reads: sameLen.length,
  };
}

/**
 * Acceptance rule: mixed alphanumeric plates need overall avg ≥70% AND weakest
 * position ≥40%. All-letter or all-digit strings are more likely stray OCR noise
 * and require avg ≥80% AND min ≥75%. The looser mixed floor handles real-world
 * cases like `1` vs `T`/`I`/`J` in California-format plates (e.g. `1ABC234`
 * where position 0 is genuinely ambiguous to ML Kit but the rest of the plate
 * is rock-solid).
 */
export function isAcceptableVote(v: VoteResult, minReads = 3): boolean {
  if (v.reads < minReads) return false;
  const mixed = /[0-9]/.test(v.plate) && /[A-Z]/.test(v.plate);
  if (mixed) return v.confidence >= 70 && v.minCharPct >= 40;
  return v.confidence >= 80 && v.minCharPct >= 75;
}
