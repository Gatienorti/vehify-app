import type { PlateRead, PlateReader } from './types';

/**
 * A deterministic mock reader for building/testing the scan UI before the real
 * onnxruntime reader (Phase 4b) is wired. Returns a canned read after a short
 * delay to imitate inference latency.
 */
export class MockPlateReader implements PlateReader {
  constructor(private readonly canned: PlateRead = MockPlateReader.default) {}

  static default: PlateRead = {
    plate: 'ABC1234',
    plateConfidence: 0.96,
    state: 'NY',
    stateIndex: 34,
    stateConfidence: 0.93,
  };

  async init(): Promise<void> {}

  async read(): Promise<PlateRead> {
    await new Promise((r) => setTimeout(r, 60));
    return this.canned;
  }

  async dispose(): Promise<void> {}
}
