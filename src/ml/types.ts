/** Result of reading a single plate crop with both models. */
export interface PlateRead {
  plate: string;
  plateConfidence: number; // 0–1, mean per-char softmax
  state: string; // label from STATE_LABELS
  stateIndex: number;
  stateConfidence: number; // 0–1, softmax prob of the argmax class
}

/**
 * A source of plate reads. The real implementation wraps onnxruntime + the two
 * bundled models; a mock implementation lets us build/test the scan UI first.
 */
export interface PlateReader {
  /** Load models / warm up. Safe to call more than once. */
  init(): Promise<void>;
  /**
   * Read a pre-cropped, pre-normalized plate.
   * @param ocrInput  Float32, length 3*48*320, CHW, normalized per OCR_NORM.
   * @param stateInput Float32, length 1*48*192, CHW, normalized per STATE_NORM.
   */
  read(ocrInput: Float32Array, stateInput: Float32Array): Promise<PlateRead>;
  dispose(): Promise<void>;
}
