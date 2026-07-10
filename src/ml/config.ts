/**
 * On-device model config for the plate scanner (Phase 4).
 *
 * Status — all confirmed by the user from the training repos:
 *   ✅ OCR normalization [-1,1], BGR channel order, CTC blank at index 0 (plate_rec.yml).
 *   ✅ OCR charset: 0-9 then A-Z (dicts/plate_dict.txt).
 *   ✅ STATE_LABELS: 50 states + DC + PR = 52, alphabetical (data/train/ folders).
 *
 * Model tensor shapes are confirmed from the .onnx files:
 *   plate_ocr:   input  image  FLOAT [batch, 3, 48, 320]  (RGB)
 *                output logits FLOAT [80, batch, 37]       (CTC, 80 steps)
 *   plate_state: input  input  FLOAT [batch, 1, 48, 192]  (grayscale)
 *                output output FLOAT [batch, 52]           (softmax)
 */

export const ML_CONFIG_UNCONFIRMED = false;

// ---- OCR (plate_ocr.onnx) --------------------------------------------------
export const OCR_INPUT = { width: 320, height: 48, channels: 3 } as const;
export const OCR_TIME_STEPS = 80;
export const OCR_NUM_CLASSES = 37; // 1 blank + 36 chars

// Confirmed from plate_rec.yml (PaddleOCR SVTR_LCNet, PostProcess CTCLabelDecode):
// blank at index 0, then the chars from ./dicts/plate_dict.txt (36 chars).
// ⚠️ Still need plate_dict.txt to lock the exact order (assumed 0-9 then A-Z).
export const OCR_BLANK_INDEX = 0;
export const OCR_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Confirmed from plate_rec.yml: RecResizeImg → (v/255 - 0.5)/0.5 = [-1,1], and
// DecodeImage img_mode: BGR (channels are B,G,R — NOT RGB). max_text_length: 8.
export const OCR_NORM = {
  mean: [0.5, 0.5, 0.5],
  std: [0.5, 0.5, 0.5],
  colorOrder: 'BGR' as 'RGB' | 'BGR',
};

// ---- State classifier (plate_state.onnx) -----------------------------------
export const STATE_INPUT = { width: 192, height: 48, channels: 1 } as const;
export const STATE_NUM_CLASSES = 52;

/** ⚠️ Assumed. Output already softmaxed; argmax → label. */
export const STATE_NORM = { mean: [0.5], std: [0.5] };

/**
 * Confirmed: 50 states + DC + PR = 52, sorted alphabetically by uppercase code
 * (torchvision ImageFolder `class_to_idx` from data/train/ folder names).
 */
export const STATE_LABELS: string[] = [
  'AK', 'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL',
  'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA',
  'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE',
  'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'PR',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI',
  'WV', 'WY',
];

// Guard: catch a mismatched label list early.
if (STATE_LABELS.length !== STATE_NUM_CLASSES) {
  throw new Error(
    `STATE_LABELS has ${STATE_LABELS.length} entries, expected ${STATE_NUM_CLASSES}.`,
  );
}
