import { decodeState } from '../state';
import { STATE_LABELS, STATE_NUM_CLASSES } from '../config';

describe('decodeState', () => {
  const labels = ['AK', 'AL', 'NY'];

  it('picks the argmax label and its probability', () => {
    const res = decodeState(new Float32Array([0.1, 0.2, 0.7]), labels);
    expect(res.label).toBe('NY');
    expect(res.index).toBe(2);
    expect(res.confidence).toBeCloseTo(0.7, 5);
  });

  it('can softmax raw logits when the model has no Softmax head', () => {
    const res = decodeState(new Float32Array([1, 2, 5]), labels, true);
    expect(res.label).toBe('NY');
    expect(res.confidence).toBeGreaterThan(0.9);
  });

  it('falls back to a class_N label when labels are short', () => {
    const res = decodeState(new Float32Array([0.2, 0.8]), ['only'], false);
    expect(res.label).toBe('class_1');
  });
});

describe('config integrity', () => {
  it('has exactly one label per state class', () => {
    expect(STATE_LABELS).toHaveLength(STATE_NUM_CLASSES);
  });
});
