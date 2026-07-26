/**
 * On-device plate reading — faithful to the ML Kit pipeline (commit 102b8dc).
 *
 * ONE photo per call, read with multi-pass consensus:
 *  1. NORMALIZE + FRAME CROP — resize to a fixed width (bakes the EXIF rotation
 *     into the pixels so cropping works in one upright space) and crop to the
 *     ScannerFrame region, in a SINGLE manipulate call. Skipping the normalize
 *     was the "crop lands on the URL bar" bug: manipulateAsync crops the raw
 *     sensor buffer, which is landscape with a rotation flag.
 *  2. LOCATE + RECTIFY — one OCR pass supplies a text hint. On iOS, Vision
 *     finds the physical plate corners and Core Image straightens the plate;
 *     any miss safely retains the original OCR locator.
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
import {
  findPlateInBlocks,
  type OcrBlockLike,
  type OcrBounding,
  type PlateCandidate,
} from './plateScore';
import { detectSlogan, detectState } from './stateDetect';
import { frameToCrop, type FrameLayout } from './frameCrop';
import { voteOnReads, isAcceptableVote, type VoteResult } from './vote';
import { findVinInOcrBlocks } from './vinDetect';
import { detectAndRectifyPlate } from './plateDetector';

export interface SingleRead {
  /** Voted plate text with OCR characters preserved for state-aware resolution. */
  plate: string;
  /** Detected state code, or null. */
  state: string | null;
  /** True when the within-photo vote clears the acceptance bar. */
  confident: boolean;
  /** The within-photo vote (for logging / cross-tick confirmation). */
  vote: VoteResult | null;
  /**
   * The frame-region crop this read came from (cache file). Handed to the
   * caller so a detection can freeze the exact image the user aimed at —
   * the CALLER owns deleting it (plateProcessor no longer cleans it up).
   */
  photoUri: string | null;
  /** True when photoUri includes the green physical-plate highlight. */
  plateDetected: boolean;
}

export interface ReadPlateOpts {
  /** Also read the state (extra wide crops). Skip once a state is locked in. */
  readState?: boolean;
  /**
   * Tap-to-capture path: spend the larger latency budget on quality — a bigger
   * normalize width (more pixels survive the frame crop), a bigger upscale, and
   * more voting passes. The 4×/sec continuous loop couldn't afford these.
   */
  highRes?: boolean;
}

export interface CapturedPlatePhoto {
  uri: string;
  width: number;
  height: number;
}

export interface PreparedPlatePhoto {
  /** Display crop (outlined preview when physical corners were detected). */
  cropUri: string | null;
  /** Clean source used for OCR; rectified on iOS, otherwise the display crop. */
  processingUri: string | null;
  detection: PlateCandidate | null;
  blocks: OcrBlockLike[];
  cropWidth: number;
  cropHeight: number;
  normalizedWidth: number;
  normalizedHeight: number;
  /** Initial candidate strength + usable region size; higher is better. */
  qualityScore: number;
  startedAt: number;
  croppedAt: number;
  locatedAt: number;
  plateDetected: boolean;
}

// Normalize width — bakes EXIF orientation and gives ML Kit a decent-res image.
// Kept near native capture width so we don't waste time upscaling; the located
// region gets upscaled to PLATE_UPSCALE_WIDTH later anyway. High-res (tap)
// keeps more of the plate's pixels before the per-region upscale.
const NORMALIZE_WIDTH = 900;
const NORMALIZE_WIDTH_HI = 1400;
// Frame crop margin, in screen points.
const FRAME_PADDING_X = 24;
const FRAME_PADDING_Y = 12;
// Plate: tight re-crops around the located region, upscaled for OCR.
const NUM_PLATE_PASSES = 6;
const PLATE_UPSCALE_WIDTH = 300;
const PLATE_UPSCALE_WIDTH_HI = 480;
// State: wide vertical re-crops (banner above / slogan below), upscaled.
const STATE_VERTICAL_FACTORS = [1.0, 1.6, 2.2, 2.8];
const STATE_UPSCALE_WIDTH = 500;

/** Delete a handed-off frame shot (see SingleRead.photoUri). */
export function discardShot(uri: string | null | undefined): void {
  if (uri) cleanup(uri);
}

/**
 * OCR an image for a printed VIN (VIN mode only — e.g. a registration doc /
 * door-jamb label where the VIN is text, not a barcode). Safe because it's a
 * deliberate VIN capture and every candidate must pass the ISO 3779 check
 * digit (a misread almost never does); the user confirms it on the review page.
 * VINs never contain I/O/Q, so those are normalized from their digit twins.
 */
export async function readVinFromImage(uri: string): Promise<string | null> {
  try {
    const blocks = (await MlkitOcr.detectFromUri(uri)) as OcrBlockLike[];
    return findVinInOcrBlocks(blocks);
  } catch {
    return null;
  }
}

/**
 * Crop a photo to the SCANNER-FRAME region (for display — e.g. the VIN still).
 * Normalize-first so the EXIF rotation is baked into pixels before the crop,
 * same as the OCR path. Returns a new cached uri, or null on failure.
 */
export async function cropToFrame(
  photoUri: string,
  photoW: number,
  photoH: number,
  frame?: FrameLayout | null,
  normalizeWidth = NORMALIZE_WIDTH_HI,
): Promise<string | null> {
  const nW = normalizeWidth;
  const nH = Math.round(nW * (photoH / photoW));
  const fc = frame
    ? frameToCrop(frame, nW, nH, FRAME_PADDING_X, FRAME_PADDING_Y)
    : { originX: Math.round(nW * 0.15), originY: Math.round(nH * 0.35), width: Math.round(nW * 0.7), height: Math.round(nH * 0.3) };
  try {
    const out = await manipulateAsync(
      photoUri,
      [{ resize: { width: nW } }, { crop: fc }],
      { format: SaveFormat.JPEG, compress: 0.9 },
    );
    return out.uri;
  } catch {
    return null;
  }
}

function cleanup(uri: string): void {
  deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/** Strip OCR punctuation while preserving ambiguous characters for later. */
function normalizePlateOcr(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
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

/** Capture only; OCR intentionally happens after the whole burst is on disk. */
export async function capturePlatePhoto(
  cam: CameraView,
  highRes = true,
): Promise<CapturedPlatePhoto | null> {
  const photo = await cam.takePictureAsync({
    skipProcessing: false,
    quality: highRes ? 0.9 : 0.7,
  });
  if (!photo?.uri || !photo.width || !photo.height) {
    if (photo?.uri) cleanup(photo.uri);
    return null;
  }
  return { uri: photo.uri, width: photo.width, height: photo.height };
}

/**
 * Normalize, crop, and run only the inexpensive locate pass. This deletes the
 * raw photo and retains the frame crop for ranked multi-pass processing.
 */
export async function preparePlatePhoto(
  photo: CapturedPlatePhoto,
  frame?: FrameLayout | null,
  opts: ReadPlateOpts = {},
): Promise<PreparedPlatePhoto> {
  const t0 = Date.now();
  const hi = opts.highRes === true;

  // 1. NORMALIZE + FRAME CROP in one pass. The normalized image is upright —
  // its height is the upright aspect (manipulate applies EXIF first).
  const nW = hi ? NORMALIZE_WIDTH_HI : NORMALIZE_WIDTH;
  const nH = Math.round(nW * (photo.height / photo.width));
  const fc = frame
    ? frameToCrop(frame, nW, nH, FRAME_PADDING_X, FRAME_PADDING_Y)
    : (() => {
        const cw = Math.round(nW * 0.7);
        const ch = Math.round(nH * 0.3);
        return { originX: Math.round((nW - cw) / 2), originY: Math.round((nH - ch) / 2), width: cw, height: ch };
      })();

  let croppedUri: string | null = null;
  try {
    const cropped = await manipulateAsync(
      photo.uri,
      // Resize to nW (the same width fc was computed against) THEN crop — a
      // mismatch here lands the crop rect outside the image ("invalid crop").
      [{ resize: { width: nW } }, { crop: fc }],
      { format: SaveFormat.JPEG, compress: 0.9 },
    );
    croppedUri = cropped.uri;
  } finally {
    // The raw camera photo is never handed outside this function.
    cleanup(photo.uri);
  }
  if (!croppedUri) throw new Error('Failed to create plate frame crop');
  const tCrop = Date.now();
  let displayUri = croppedUri;
  let processingUri = croppedUri;
  try {
    // 2. LOCATE + RECTIFY. The first OCR pass is retained as both a fallback
    // and a hint for choosing among Vision's physical rectangle candidates.
    const initialBlocks = (await MlkitOcr.detectFromUri(croppedUri)) as OcrBlockLike[];
    const initialDetection = findPlateInBlocks(initialBlocks);
    let blocks = initialBlocks;
    let detection = initialDetection;
    let cW = fc.width;
    let cH = fc.height;
    let plateDetected = false;

    const rectified = await detectAndRectifyPlate(
      croppedUri,
      initialDetection?.region ?? null,
      fc.width,
      fc.height,
    );
    if (rectified) {
      try {
        const rectifiedBlocks = (await MlkitOcr.detectFromUri(
          rectified.rectifiedUri,
        )) as OcrBlockLike[];
        const rectifiedDetection = findPlateInBlocks(rectifiedBlocks);
        // A rectangle alone is not enough: vehicle trim, stickers, and badges
        // are rectangular too. Adopt it only when the corrected crop still
        // contains plate-like text; otherwise keep the proven OCR fallback.
        if (rectifiedDetection) {
          cleanup(croppedUri);
          displayUri = rectified.previewUri;
          processingUri = rectified.rectifiedUri;
          blocks = rectifiedBlocks;
          detection = rectifiedDetection;
          cW = rectified.width;
          cH = rectified.height;
          plateDetected = true;
          if (__DEV__) {
            console.log(
              `[plateCorners] used conf=${Math.round(rectified.confidence * 100)} ` +
                `aspect=${rectified.aspect.toFixed(2)} area=${rectified.area.toFixed(2)} ` +
                `rectified=${rectified.width}x${rectified.height}`,
            );
          }
        } else {
          cleanup(rectified.rectifiedUri);
          cleanup(rectified.previewUri);
          if (__DEV__) console.log('[plateCorners] rejected: rectified crop had no plate text');
        }
      } catch (error) {
        cleanup(rectified.rectifiedUri);
        cleanup(rectified.previewUri);
        if (__DEV__) console.log('[plateCorners] OCR fallback:', error);
      }
    } else if (__DEV__) {
      console.log('[plateCorners] none; using OCR locator');
    }

    const tLocate = Date.now();
    if (__DEV__) {
      const saw = blocks
        .map(
          (b) =>
            `${b.text.replace(/\s+/g, ' ').slice(0, 24)}@${Math.round(b.bounding.left)},${Math.round(b.bounding.top)},${Math.round(b.bounding.width)}x${Math.round(b.bounding.height)}`,
        )
        .join(' | ')
        .slice(0, 500);
      console.log(`[plateLocate] candidate=${detection?.text ?? 'none'} blocks=${saw || '(none)'}`);
    }
    const regionRatio = detection
      ? (detection.region.width * detection.region.height) / Math.max(1, cW * cH)
      : 0;
    return {
      cropUri: displayUri,
      processingUri,
      detection,
      blocks,
      cropWidth: cW,
      cropHeight: cH,
      normalizedWidth: nW,
      normalizedHeight: nH,
      // Candidate grammar dominates; region size breaks ties in favor of a
      // larger, more legible plate within the aimed frame.
      qualityScore: detection ? detection.score * 1000 + Math.round(regionRatio * 1000) : 0,
      startedAt: t0,
      croppedAt: tCrop,
      locatedAt: tLocate,
      plateDetected,
    };
  } catch (error) {
    for (const uri of new Set([croppedUri, displayUri, processingUri])) cleanup(uri);
    throw error;
  }
}

/** Delete a prepared crop that was not handed to the review screen. */
export function discardPreparedPlate(photo: PreparedPlatePhoto): void {
  for (const uri of new Set([photo.cropUri, photo.processingUri])) {
    if (uri) cleanup(uri);
  }
  photo.cropUri = null;
  photo.processingUri = null;
}

/** Hand the display preview to the caller and discard its clean OCR source. */
function consumePreparedPhoto(photo: PreparedPlatePhoto): string {
  if (!photo.cropUri || !photo.processingUri) {
    throw new Error('Prepared plate crop has already been consumed');
  }
  const displayUri = photo.cropUri;
  if (photo.processingUri !== displayUri) cleanup(photo.processingUri);
  photo.cropUri = null;
  photo.processingUri = null;
  return displayUri;
}

/** Run the expensive multi-pass vote on one ranked, prepared frame. */
export async function readPreparedPlate(
  prepared: PreparedPlatePhoto,
  opts: ReadPlateOpts = {},
): Promise<SingleRead> {
  const hi = opts.highRes === true;
  const {
    detection,
    blocks,
    cropWidth: cW,
    cropHeight: cH,
    normalizedWidth: nW,
    normalizedHeight: nH,
    startedAt: t0,
    croppedAt: tCrop,
    locatedAt: tLocate,
  } = prepared;
  const displayUri = prepared.cropUri;
  const processingUri = prepared.processingUri;
  if (!displayUri || !processingUri) {
    throw new Error('Prepared plate crop has already been consumed');
  }

  if (!detection) {
    if (__DEV__) {
      const saw = blocks.map((b) => b.text.replace(/\n/g, ' ')).join(' | ').slice(0, 80);
      console.log(
        `[readPlate] crop=${tCrop - t0}ms locate=${tLocate - tCrop}ms | ${nW}x${nH} | saw: "${saw}" | no plate`,
      );
    }
    // No plate located, but hand back the SCANNER-FRAME crop as the display
    // shot — the confirm page shows the region we aimed at, never the whole
    // photo. (Caller owns deleting it.)
    const photoUri = consumePreparedPhoto(prepared);
    return {
      plate: '',
      state: null,
      confident: false,
      vote: null,
      photoUri,
      plateDetected: prepared.plateDetected,
    };
  }

  // 3 + 4. Plate vote and state vote, concurrently.
  const tMulti = Date.now();
  const platePads = hi
    ? [0.02, 0.08, 0.14, 0.22, 0.32, 0.44, 0.58, 0.78, 1.02, 1.35]
    : Array.from({ length: NUM_PLATE_PASSES }, (_, i) => 0.02 + i * 0.08);
  const upscale = hi ? PLATE_UPSCALE_WIDTH_HI : PLATE_UPSCALE_WIDTH;
  const platePromise = Promise.allSettled(
    platePads.map((f) =>
      recropAndOcr(
        processingUri,
        detection.region,
        cW,
        cH,
        Math.max(10, detection.region.width * f),
        Math.max(5, detection.region.height * f),
        upscale,
      ),
    ),
  );
  const statePromise = opts.readState
    ? voteState(processingUri, detection.region, cW, cH)
    : Promise.resolve(null);
  const [plateResults, state] = await Promise.all([platePromise, statePromise]);

  const reads: string[] = [normalizePlateOcr(detection.text)];
  for (const res of plateResults) {
    if (res.status !== 'fulfilled') continue;
    const d = findPlateInBlocks(res.value);
    if (d) reads.push(normalizePlateOcr(d.text));
  }
  const vote = voteOnReads(reads, { preferDigitTwins: false });
  const confident = vote ? isAcceptableVote(vote, 3) : false;

  if (__DEV__) {
    const tEnd = Date.now();
    console.log(
      `[readPlate] crop=${tCrop - t0}ms locate=${tLocate - tCrop}ms multi=${tEnd - tMulti}ms | ${nW}x${nH} | reads=${reads.length} plate=${vote?.plate ?? '?'} conf=${vote?.confidence ?? 0} min=${vote?.minCharPct ?? 0} ${confident ? 'OK' : 'weak'} | state=${state ?? 'none'}`,
    );
  }

  const photoUri = consumePreparedPhoto(prepared);
  return {
    plate: vote?.plate ?? '',
    state,
    confident,
    vote,
    photoUri,
    plateDetected: prepared.plateDetected,
  };
}

/** OCR one already-captured burst photo. Always deletes the raw photo. */
export async function readPlatePhoto(
  photo: CapturedPlatePhoto,
  frame?: FrameLayout | null,
  opts: ReadPlateOpts = {},
): Promise<SingleRead> {
  const prepared = await preparePlatePhoto(photo, frame, opts);
  try {
    return await readPreparedPlate(prepared, opts);
  } finally {
    discardPreparedPlate(prepared);
  }
}

/** Convenience wrapper retained for callers that want a single capture/read. */
export async function readPlateOnce(
  cam: CameraView,
  frame?: FrameLayout | null,
  opts: ReadPlateOpts = {},
): Promise<SingleRead | null> {
  const photo = await capturePlatePhoto(cam, opts.highRes === true);
  return photo ? readPlatePhoto(photo, frame, opts) : null;
}
