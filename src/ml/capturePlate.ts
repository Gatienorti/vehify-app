import { manipulateAsync, SaveFormat, type ActionCrop } from 'expo-image-manipulator';
import { decode as decodePng } from 'fast-png';
import { toByteArray } from 'base64-js';
import type { CameraView } from 'expo-camera';
import { OCR_INPUT, STATE_INPUT } from './config';
import { ocrTensor, stateTensor } from './preprocess';
import type { PlateRead, PlateReader } from './types';

// Centered crop of the photo used as the plate region. Matches the on-screen
// alignment frame's aspect (280×172). Tune on-device if plates read poorly.
const CROP_W_FRAC = 0.82;
const CROP_ASPECT = 172 / 280;

async function resizeDecode(uri: string, crop: ActionCrop['crop'], w: number, h: number) {
  const img = await manipulateAsync(
    uri,
    [{ crop }, { resize: { width: w, height: h } }],
    { base64: true, format: SaveFormat.PNG },
  );
  return decodePng(toByteArray(img.base64 ?? ''));
}

/**
 * Capture one frame, crop to the plate region, run both models, return the read.
 * Returns null if no photo could be captured.
 */
export async function capturePlate(cam: CameraView, reader: PlateReader): Promise<PlateRead | null> {
  const photo = await cam.takePictureAsync({ skipProcessing: true });
  if (!photo?.uri || !photo.width || !photo.height) return null;

  const cropW = Math.round(photo.width * CROP_W_FRAC);
  const cropH = Math.round(cropW * CROP_ASPECT);
  const crop = {
    originX: Math.round((photo.width - cropW) / 2),
    originY: Math.round((photo.height - cropH) / 2),
    width: cropW,
    height: cropH,
  };

  const ocrPng = await resizeDecode(photo.uri, crop, OCR_INPUT.width, OCR_INPUT.height);
  const statePng = await resizeDecode(photo.uri, crop, STATE_INPUT.width, STATE_INPUT.height);

  const ocrIn = ocrTensor(ocrPng.data as Uint8Array, ocrPng.channels);
  const stateIn = stateTensor(statePng.data as Uint8Array, statePng.channels);

  return reader.read(ocrIn, stateIn);
}
