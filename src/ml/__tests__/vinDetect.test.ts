import { findVinInBlocks } from '../vinDetect';
import type { OcrBlockLike } from '../plateScore';

const box = { left: 0, top: 0, width: 100, height: 20 };
const block = (...lineTexts: string[]): OcrBlockLike => ({
  text: lineTexts.join('\n'),
  bounding: box,
  lines: lineTexts.map((text) => ({ text, bounding: box })),
});

// 1HGCM82633A004352 and 11111111111111111 both carry valid ISO 3779 check digits.
const REAL_VIN = '1HGCM82633A004352';

describe('findVinInBlocks', () => {
  it('reads a bare VIN printed on one line', () => {
    expect(findVinInBlocks([block(REAL_VIN)])).toBe(REAL_VIN);
  });

  it('reads a "VIN:"-prefixed door-jamb line', () => {
    expect(findVinInBlocks([block(`VIN: ${REAL_VIN}`)])).toBe(REAL_VIN);
  });

  it('collapses stray OCR spaces within the line', () => {
    expect(findVinInBlocks([block('1HGCM826 33A004352')])).toBe(REAL_VIN);
  });

  it('applies I→1 / O→0 OCR corrections', () => {
    expect(findVinInBlocks([block('IHGCM82633AO04352')])).toBe(REAL_VIN);
  });

  it('never stitches a VIN across separate lines (the TEXAS plate bug)', () => {
    // "TEXAS" + "BC5X489" + "TEXAS" = 17 chars that even pass the check digit
    // by coincidence — per-line scanning is what must reject it.
    const plate = [block('TEXAS'), block('BC5 X489'), block('TEXAS')];
    expect(findVinInBlocks(plate)).toBeNull();
    // Same content as lines of a single block.
    expect(findVinInBlocks([block('TEXAS', 'BC5 X489', 'TEXAS')])).toBeNull();
  });

  it('rejects a 17-char run with a wrong check digit', () => {
    // Same as REAL_VIN but position 9 tampered from 3 → 4.
    expect(findVinInBlocks([block('1HGCM82634A004352')])).toBeNull();
  });

  it('accepts the all-ones test VIN (valid checksum)', () => {
    expect(findVinInBlocks([block('11111111111111111')])).toBe('11111111111111111');
  });

  it('returns null when nothing VIN-like is present', () => {
    expect(findVinInBlocks([block('Texas License Plate Lookup — Full Vehicle History')])).toBeNull();
  });

  it('never window-scans a dense merged line (the registration-card bug)', () => {
    // A registration card line MLKit merged from several fragments. A random
    // 17-char window of it can pass the check digit (~1/11 odds) — the line
    // being far longer than a bare VIN is what must reject it.
    expect(findVinInBlocks([block('096998EM40805611116ELU3950PAS8G0910')])).toBeNull();
    // The all-ones VIN passes the checksum — buried in a long line it must
    // still be rejected (only near-bare VIN lines are trusted).
    expect(findVinInBlocks([block('REGISTRATION11111111111111111CARD')])).toBeNull();
  });

  it('still accepts a bare VIN line with small trailing noise', () => {
    expect(findVinInBlocks([block('1HGCM82633A004352 *')])).toBe(REAL_VIN);
  });
});
