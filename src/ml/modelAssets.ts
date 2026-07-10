/**
 * Bundled model asset references. Kept separate from config.ts so the pure
 * decoders (ctc/state) stay importable in tests without pulling ~40 MB of
 * binary assets into the module graph.
 *
 * Only the real onnxruntime loader (Phase 4b) imports this. Resolve to a local
 * file URI with expo-asset before handing to onnxruntime-react-native:
 *
 *   const asset = Asset.fromModule(MODEL_ASSETS.ocr);
 *   await asset.downloadAsync();
 *   const session = await InferenceSession.create(asset.localUri!);
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro assets require() */
export const MODEL_ASSETS = {
  ocr: require('../../assets/models/plate_ocr.onnx'),
  state: require('../../assets/models/plate_state.onnx'),
} as const;
