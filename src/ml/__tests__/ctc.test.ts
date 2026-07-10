import { ctcGreedyDecode } from '../ctc';

// Tiny alphabet: class 0 = blank, class 1 = 'A', class 2 = 'B'.
const NUM = 3;
const CHARS = 'AB';

/** Build [timeSteps, NUM] logits from a list of argmax class indices (one-hot-ish). */
function logitsFrom(steps: number[]): Float32Array {
  const out = new Float32Array(steps.length * NUM);
  steps.forEach((cls, t) => {
    for (let c = 0; c < NUM; c += 1) out[t * NUM + c] = c === cls ? 10 : 0;
  });
  return out;
}

describe('ctcGreedyDecode', () => {
  it('collapses repeats and drops blanks', () => {
    // A A blank A B B -> "AAB"? No: collapse consecutive, blank resets prev.
    const res = ctcGreedyDecode(logitsFrom([1, 1, 0, 1, 2, 2]), 6, NUM, CHARS, 0);
    expect(res.text).toBe('AAB');
  });

  it('treats a run without a blank as a single character', () => {
    const res = ctcGreedyDecode(logitsFrom([1, 1, 1, 1]), 4, NUM, CHARS, 0);
    expect(res.text).toBe('A');
  });

  it('returns empty string for all-blank input with zero confidence', () => {
    const res = ctcGreedyDecode(logitsFrom([0, 0, 0]), 3, NUM, CHARS, 0);
    expect(res.text).toBe('');
    expect(res.confidence).toBe(0);
  });

  it('produces a confidence in (0,1] for confident logits', () => {
    const res = ctcGreedyDecode(logitsFrom([1, 0, 2]), 3, NUM, CHARS, 0);
    expect(res.text).toBe('AB');
    expect(res.confidence).toBeGreaterThan(0.9);
    expect(res.confidence).toBeLessThanOrEqual(1);
  });
});
