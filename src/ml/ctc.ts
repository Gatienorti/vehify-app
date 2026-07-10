/**
 * CTC greedy decoder for the plate OCR model.
 *
 * The model emits logits shaped [timeSteps, numClasses] for a single plate
 * (batch already sliced). Greedy decode = per-step argmax → collapse repeated
 * classes → drop the blank. Confidence is the mean softmax probability of the
 * emitted (non-blank) steps.
 */

export interface CtcResult {
  text: string;
  confidence: number; // 0–1
  perChar: number[]; // softmax prob for each emitted character
}

/** Build the per-class symbol table, inserting '' at the blank index. */
function buildAlphabet(chars: string, numClasses: number, blankIndex: number): string[] {
  const alphabet = new Array<string>(numClasses);
  let k = 0;
  for (let c = 0; c < numClasses; c += 1) {
    if (c === blankIndex) {
      alphabet[c] = '';
    } else {
      alphabet[c] = chars[k] ?? '';
      k += 1;
    }
  }
  return alphabet;
}

function softmaxMax(logits: Float32Array, offset: number, numClasses: number): {
  argmax: number;
  prob: number;
} {
  let maxLogit = -Infinity;
  let argmax = 0;
  for (let c = 0; c < numClasses; c += 1) {
    const v = logits[offset + c] as number;
    if (v > maxLogit) {
      maxLogit = v;
      argmax = c;
    }
  }
  let sum = 0;
  for (let c = 0; c < numClasses; c += 1) {
    sum += Math.exp((logits[offset + c] as number) - maxLogit);
  }
  return { argmax, prob: 1 / sum }; // exp(max-max)=1 over sum
}

export function ctcGreedyDecode(
  logits: Float32Array,
  timeSteps: number,
  numClasses: number,
  chars: string,
  blankIndex = 0,
): CtcResult {
  const alphabet = buildAlphabet(chars, numClasses, blankIndex);
  let text = '';
  const perChar: number[] = [];
  let prev = -1;

  for (let t = 0; t < timeSteps; t += 1) {
    const { argmax, prob } = softmaxMax(logits, t * numClasses, numClasses);
    if (argmax !== blankIndex && argmax !== prev) {
      text += alphabet[argmax];
      perChar.push(prob);
    }
    prev = argmax;
  }

  const confidence =
    perChar.length === 0 ? 0 : perChar.reduce((a, b) => a + b, 0) / perChar.length;

  return { text, confidence, perChar };
}
