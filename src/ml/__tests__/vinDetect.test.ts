import { findVinInOcrBlocks } from '../vinDetect';
import type { OcrBlockLike } from '../plateScore';

const region = { left: 0, top: 0, width: 100, height: 20 };

function blocks(...lines: string[]): OcrBlockLike[] {
  return [
    {
      text: lines.join('\n'),
      bounding: region,
      lines: lines.map((text) => ({ text, bounding: region })),
    },
  ];
}

describe('findVinInOcrBlocks', () => {
  it('accepts an exact checksum-valid VIN token', () => {
    expect(findVinInOcrBlocks(blocks('VIN', '1HGCM82633A004352'))).toBe('1HGCM82633A004352');
  });

  it('joins split chunks only on an explicitly labeled VIN line', () => {
    expect(findVinInOcrBlocks(blocks('VIN: 1HG CM826 33A 004352'))).toBe(
      '1HGCM82633A004352',
    );
    expect(findVinInOcrBlocks(blocks('V1N NUMBER: 1HG CM826 33A 004352'))).toBe(
      '1HGCM82633A004352',
    );
  });

  it('does not join unlabeled document chunks', () => {
    expect(findVinInOcrBlocks(blocks('1HG CM826 33A 004352'))).toBeNull();
  });

  it('rejects a labeled value with a bad check digit', () => {
    expect(findVinInOcrBlocks(blocks('VIN: 1HG CM826 34A 004352'))).toBeNull();
  });
});
