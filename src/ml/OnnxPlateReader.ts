import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { Asset } from 'expo-asset';
import { MODEL_ASSETS } from './modelAssets';
import {
  OCR_BLANK_INDEX,
  OCR_CHARS,
  OCR_NUM_CLASSES,
  OCR_TIME_STEPS,
  STATE_LABELS,
} from './config';
import { ctcGreedyDecode } from './ctc';
import { decodeState } from './state';
import type { PlateRead, PlateReader } from './types';

/**
 * Runs the two bundled ONNX models on-device via onnxruntime-react-native.
 * Models load lazily on first read and stay resident.
 */
export class OnnxPlateReader implements PlateReader {
  private ocr: InferenceSession | null = null;
  private state: InferenceSession | null = null;

  async init(): Promise<void> {
    if (this.ocr && this.state) return;
    const ocrAsset = await Asset.fromModule(MODEL_ASSETS.ocr).downloadAsync();
    const stateAsset = await Asset.fromModule(MODEL_ASSETS.state).downloadAsync();
    this.ocr = await InferenceSession.create(ocrAsset.localUri ?? ocrAsset.uri);
    this.state = await InferenceSession.create(stateAsset.localUri ?? stateAsset.uri);
  }

  async read(ocrInput: Float32Array, stateInput: Float32Array): Promise<PlateRead> {
    await this.init();
    const ocr = this.ocr;
    const state = this.state;
    if (!ocr || !state) throw new Error('Models not initialized');

    const ocrOut = await ocr.run({
      [ocr.inputNames[0] as string]: new Tensor('float32', ocrInput, [1, 3, 48, 320]),
    });
    const logits = ocrOut[ocr.outputNames[0] as string].data as Float32Array;
    const decoded = ctcGreedyDecode(logits, OCR_TIME_STEPS, OCR_NUM_CLASSES, OCR_CHARS, OCR_BLANK_INDEX);

    const stateOut = await state.run({
      [state.inputNames[0] as string]: new Tensor('float32', stateInput, [1, 1, 48, 192]),
    });
    const probs = stateOut[state.outputNames[0] as string].data as Float32Array;
    const st = decodeState(probs, STATE_LABELS);

    return {
      plate: decoded.text,
      plateConfidence: decoded.confidence,
      state: st.label,
      stateIndex: st.index,
      stateConfidence: st.confidence,
    };
  }

  async dispose(): Promise<void> {
    await this.ocr?.release();
    await this.state?.release();
    this.ocr = null;
    this.state = null;
  }
}

/** Shared instance so the models load once for the whole app. */
export const plateReader = new OnnxPlateReader();
