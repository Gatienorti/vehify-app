/**
 * On-device model config for the plate scanner (Phase 4).
 *
 * ⚠️ UNCONFIRMED VALUES. These must be replaced with the exact values from the
 * training repos (`plate_ocr` and `drn_plate-state-classifier`) or decoding will
 * silently produce wrong text/states. Fill in from the training code:
 *   1. OCR charset order + blank index (below)
 *   2. STATE_LABELS — the 52-class `class_to_idx` ordering (ImageFolder sorted names)
 *   3. Normalization (mean/std, color order) for each model's transforms
 *
 * Model tensor shapes are confirmed from the .onnx files:
 *   plate_ocr:   input  image  FLOAT [batch, 3, 48, 320]  (RGB)
 *                output logits FLOAT [80, batch, 37]       (CTC, 80 steps)
 *   plate_state: input  input  FLOAT [batch, 1, 48, 192]  (grayscale)
 *                output output FLOAT [batch, 52]           (softmax)
 */

export const ML_CONFIG_UNCONFIRMED = true;

// ---- OCR (plate_ocr.onnx) --------------------------------------------------
export const OCR_INPUT = { width: 320, height: 48, channels: 3 } as const;
export const OCR_TIME_STEPS = 80;
export const OCR_NUM_CLASSES = 37; // 1 blank + 36 chars

/** ⚠️ Assumed order. Index 0 is the CTC blank; classes 1..36 map to these chars. */
export const OCR_BLANK_INDEX = 0;
export const OCR_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** ⚠️ Assumed. Pixel v in [0,255] → (v/255 - mean)/std, per channel. */
export const OCR_NORM = {
  mean: [0.5, 0.5, 0.5],
  std: [0.5, 0.5, 0.5],
  colorOrder: 'RGB' as 'RGB' | 'BGR',
};

// ---- State classifier (plate_state.onnx) -----------------------------------
export const STATE_INPUT = { width: 192, height: 48, channels: 1 } as const;
export const STATE_NUM_CLASSES = 52;

/** ⚠️ Assumed. Output already softmaxed; argmax → label. */
export const STATE_NORM = { mean: [0.5], std: [0.5] };

/**
 * ⚠️ PLACEHOLDER ORDER — 50 states + DC (alphabetical by code) + Unknown = 52.
 * Replace with the real `class_to_idx` from the classifier's training data.
 */
export const STATE_LABELS: string[] = [
  'AK', 'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL',
  'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA',
  'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE',
  'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV',
  'WY', 'Unknown',
];

// Guard: catch a mismatched label list early.
if (STATE_LABELS.length !== STATE_NUM_CLASSES) {
  throw new Error(
    `STATE_LABELS has ${STATE_LABELS.length} entries, expected ${STATE_NUM_CLASSES}.`,
  );
}
