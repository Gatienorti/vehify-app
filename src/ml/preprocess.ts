import { OCR_INPUT, STATE_INPUT } from './config';

/** Normalize a 0–255 channel to [-1,1] — (v/255 - 0.5)/0.5 (confirmed from plate_rec.yml). */
function norm(v: number): number {
  return (v / 255 - 0.5) / 0.5;
}

/**
 * Pixels of a 320×48 image → OCR tensor [1,3,48,320], CHW, **BGR** order, [-1,1].
 * (plate_rec was trained with img_mode: BGR — channel order matters.)
 */
export function ocrTensor(data: Uint8Array | Uint8ClampedArray, channels: number): Float32Array {
  const W = OCR_INPUT.width; // 320
  const H = OCR_INPUT.height; // 48
  const plane = W * H;
  const out = new Float32Array(3 * plane);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = (y * W + x) * channels;
      const idx = y * W + x;
      out[idx] = norm(data[p + 2] ?? 0); // B
      out[plane + idx] = norm(data[p + 1] ?? 0); // G
      out[2 * plane + idx] = norm(data[p] ?? 0); // R
    }
  }
  return out;
}

/** Pixels of a 192×48 image → state tensor [1,1,48,192], grayscale (luma), [-1,1]. */
export function stateTensor(data: Uint8Array | Uint8ClampedArray, channels: number): Float32Array {
  const W = STATE_INPUT.width; // 192
  const H = STATE_INPUT.height; // 48
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = (y * W + x) * channels;
      const gray = 0.299 * (data[p] ?? 0) + 0.587 * (data[p + 1] ?? 0) + 0.114 * (data[p + 2] ?? 0);
      out[y * W + x] = norm(gray);
    }
  }
  return out;
}
