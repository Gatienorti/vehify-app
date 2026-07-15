/**
 * On-device plate reading — faithful to the ML Kit pipeline (commit 102b8dc).
 *
 * ONE photo per call, read with multi-pass consensus:
 *  1. NORMALIZE + FRAME CROP — resize to a fixed width (bakes the EXIF rotation
 *     into the pixels so cropping works in one upright space) and crop to the
 *     ScannerFrame region, in a SINGLE manipulate call. Skipping the normalize
 *     was the "crop lands on the URL bar" bug: manipulateAsync crops the raw
 *     sensor buffer, which is landscape with a rotation flag.
 *  2. LOCATE — one OCR pass. findVinInBlocks first (a 17-char VIN in frame
 *     wins immediately — free lookup), else findPlateInBlocks → the plate's
 *     bounding region.
 *  3. PLATE VOTE — tight re-crops around the region, each upscaled, OCR'd, then
 *     per-character voting (voteOnReads). Upscaling the located region is what
 *     makes ML Kit read the digits reliably.
 *  4. STATE VOTE — wide vertical re-crops around the region, upscaled, OCR'd →
 *     detectState/detectSlogan, most-voted wins. Runs concurrently with the
 *     plate vote, and only when the caller still needs a state (opts.readState).
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { deleteAsync } from 'expo-file-system/legacy';
import MlkitOcr from 'react-native-mlkit-ocr';
import type { CameraView } from 'expo-camera';
import { findPlateInBlocks, type OcrBlockLike, type OcrBounding } from './plateScore';
import { findVinInBlocks } from './vinDetect';
import { detectSlogan, detectState } from './stateDetect';
import { frameToCrop, type FrameLayout } from './frameCrop';
import { voteOnReads, isAcceptableVote, type VoteResult } from './vote';

export interface SingleRead {
  /**
   * A valid 17-char VIN spotted in the frame (door-jamb label text). Checked
   * BEFORE the plate scorer — a VIN can't be confused with a 5–8 char plate,
   * and the VIN route is the free one. When set, the plate fields are empty.
   */
  vin: string | null;
  /** Voted plate text (normalized: I/O/Q → 1/0/0). */
  plate: string;
  /** Detected state code, or null. */
  state: string | null;
  /** True when the within-photo vote clears the acceptance bar. */
  confident: boolean;
  /** The within-photo vote (for logging / cross-tick confirmation). */
  vote: VoteResult | null;
}

export interface ReadPlateOpts {
  /** Also read the state (extra wide crops). Skip once a state is locked in. */
  readState?: boolean;
}

// Normalize width — bakes EXIF orientation and gives ML Kit a decent-res image.
// Kept near native capture width so we don't waste time upscaling; the located
// region gets upscaled to PLATE_UPSCALE_WIDTH later anyway.
const NORMALIZE_WIDTH = 900;
// Frame crop margin, in screen points.
const FRAME_PADDING = 12;
// Plate: tight re-crops around the located region, upscaled for OCR.
const NUM_PLATE_PASSES = 6;
const PLATE_UPSCALE_WIDTH = 300;
// State: wide vertical re-crops (banner above / slogan below), upscaled.
const STATE_VERTICAL_FACTORS = [1.0, 1.6, 2.2, 2.8];
const STATE_UPSCALE_WIDTH = 500;

function cleanup(uri: string): void {
  deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/** US plates never issue I, O, Q — any OCR'd I/O/Q is a misread of 1/0/0. */
function normalizePlateOcr(text: string): string {
  return text.replace(/I/g, '1').replace(/O/g, '0').replace(/Q/g, '0');
}

/** Crop `srcUri` to a padded box around `r`, upscale to `width`, OCR it. */
async function recropAndOcr(
  srcUri: string,
  r: OcrBounding,
  cW: number,
  cH: number,
  padX: number,
  padY: number,
  width: number,
): Promise<OcrBlockLike[]> {
  const ox = Math.max(0, r.left - padX);
  const oy = Math.max(0, r.top - padY);
  const ow = Math.min(cW - ox, r.width + padX * 2);
  const oh = Math.min(cH - oy, r.height + padY * 2);
  const variant = await manipulateAsync(
    srcUri,
    [{ crop: { originX: ox, originY: oy, width: ow, height: oh } }, { resize: { width } }],
    { format: SaveFormat.JPEG, compress: 1 },
  );
  try {
    return (await MlkitOcr.detectFromUri(variant.uri)) as OcrBlockLike[];
  } finally {
    cleanup(variant.uri);
  }
}

/** Most-voted state across the wide vertical re-crops. */
async function voteState(croppedUri: string, r: OcrBounding, cW: number, cH: number): Promise<string | null> {
  const padX = Math.max(20, r.width * 0.5);
  const results = await Promise.allSettled(
    STATE_VERTICAL_FACTORS.map((vy) =>
      recropAndOcr(croppedUri, r, cW, cH, padX, Math.max(40, r.height * vy), STATE_UPSCALE_WIDTH),
    ),
  );
  const votes = new Map<string, number>();
  for (const res of results) {
    if (res.status !== 'fulfilled') continue;
    const text = res.value.map((b) => b.text).join(' ');
    const code = detectState(text) ?? detectSlogan(text);
    if (code) votes.set(code, (votes.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let top = 0;
  for (const [code, count] of votes) {
    if (count > top) { best = code; top = count; }
  }
  return best;
}

export async function readPlateOnce(
  cam: CameraView,
  frame?: FrameLayout | null,
  opts: ReadPlateOpts = {},
): Promise<SingleRead | null> {
  const t0 = Date.now();
  const photo = await cam.takePictureAsync({ skipProcessing: false, quality: 0.7 });
  const tPhoto = Date.now();
  if (!photo?.uri || !photo.width || !photo.height) return null;

  // 1. NORMALIZE + FRAME CROP in one pass. The normalized image is width 900,
  // upright — its height is the upright aspect (manipulate applies EXIF first).
  const nW = NORMALIZE_WIDTH;
  const nH = Math.round(NORMALIZE_WIDTH * (photo.height / photo.width));
  const fc = frame
    ? frameToCrop(frame, nW, nH, FRAME_PADDING)
    : (() => {
        const cw = Math.round(nW * 0.7);
        const ch = Math.round(nH * 0.3);
        return { originX: Math.round((nW - cw) / 2), originY: Math.round((nH - ch) / 2), width: cw, height: ch };
      })();

  const cropped = await manipulateAsync(
    photo.uri,
    [{ resize: { width: NORMALIZE_WIDTH } }, { crop: fc }],
    { format: SaveFormat.JPEG, compress: 0.9 },
  );
  cleanup(photo.uri);
  const tCrop = Date.now();

  // 2. LOCATE — one OCR pass over the frame crop. A valid 17-char VIN in the
  // text wins immediately (free lookup, unambiguous vs a 5–8 char plate).
  const blocks = (await MlkitOcr.detectFromUri(cropped.uri)) as OcrBlockLike[];
  const vinHit = findVinInBlocks(blocks);
  if (vinHit) {
    if (__DEV__) {
      console.log(`[readPlate] photo=${tPhoto - t0}ms crop=${tCrop - tPhoto}ms | ${nW}x${nH} | VIN: ${vinHit}`);
    }
    cleanup(cropped.uri);
    return { vin: vinHit, plate: '', state: null, confident: false, vote: null };
  }
  const detection = findPlateInBlocks(blocks);
  const tLocate = Date.now();

  if (!detection) {
    if (__DEV__) {
      const saw = blocks.map((b) => b.text.replace(/\n/g, ' ')).join(' | ').slice(0, 80);
      console.log(`[readPlate] photo=${tPhoto - t0}ms crop=${tCrop - tPhoto}ms locate=${tLocate - tCrop}ms | ${nW}x${nH} | saw: "${saw}" | no plate`);
    }
    cleanup(cropped.uri);
    return { vin: null, plate: '', state: null, confident: false, vote: null };
  }

  const cW = fc.width;
  const cH = fc.height;

  // 3 + 4. Plate vote and state vote, concurrently.
  const platePads = Array.from({ length: NUM_PLATE_PASSES }, (_, i) => 0.02 + i * 0.06);
  const platePromise = Promise.allSettled(
    platePads.map((f) =>
      recropAndOcr(
        cropped.uri,
        detection.region,
        cW,
        cH,
        Math.max(10, detection.region.width * f),
        Math.max(5, detection.region.height * f),
        PLATE_UPSCALE_WIDTH,
      ),
    ),
  );
  const statePromise = opts.readState ? voteState(cropped.uri, detection.region, cW, cH) : Promise.resolve(null);
  const [plateResults, state] = await Promise.all([platePromise, statePromise]);
  cleanup(cropped.uri);

  const reads: string[] = [normalizePlateOcr(detection.text)];
  for (const res of plateResults) {
    if (res.status !== 'fulfilled') continue;
    const d = findPlateInBlocks(res.value);
    if (d) reads.push(normalizePlateOcr(d.text));
  }
  const vote = voteOnReads(reads);
  const confident = vote ? isAcceptableVote(vote, 3) : false;

  if (__DEV__) {
    const tEnd = Date.now();
    console.log(
      `[readPlate] photo=${tPhoto - t0}ms crop=${tCrop - tPhoto}ms locate=${tLocate - tCrop}ms multi=${tEnd - tLocate}ms | ${nW}x${nH} | reads=${reads.length} plate=${vote?.plate ?? '?'} conf=${vote?.confidence ?? 0} min=${vote?.minCharPct ?? 0} ${confident ? 'OK' : 'weak'} | state=${state ?? 'none'}`,
    );
  }

  return { vin: null, plate: vote?.plate ?? '', state, confident, vote };
}
