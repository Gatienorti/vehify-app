/**
 * State-classifier decoder. The model's output already passes through Softmax,
 * so we just argmax and map to a label. (If a future export drops the Softmax,
 * set `applySoftmax` to normalize raw logits here.)
 */

export interface StateResult {
  label: string;
  index: number;
  confidence: number; // 0–1
}

export function decodeState(
  probs: Float32Array,
  labels: string[],
  applySoftmax = false,
): StateResult {
  const n = probs.length;
  let values: Float32Array | number[] = probs;

  if (applySoftmax) {
    let max = -Infinity;
    for (let i = 0; i < n; i += 1) max = Math.max(max, probs[i] as number);
    let sum = 0;
    const out = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      out[i] = Math.exp((probs[i] as number) - max);
      sum += out[i] as number;
    }
    for (let i = 0; i < n; i += 1) out[i] = (out[i] as number) / sum;
    values = out;
  }

  let argmax = 0;
  let best = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const v = values[i] as number;
    if (v > best) {
      best = v;
      argmax = i;
    }
  }

  return {
    label: labels[argmax] ?? `class_${argmax}`,
    index: argmax,
    confidence: best,
  };
}
