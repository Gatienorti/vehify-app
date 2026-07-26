import { findPlateInBlocks, isStateText, scorePlateText, type OcrBlockLike } from '../plateScore';

const region = { left: 0, top: 0, width: 100, height: 40 };

function block(text: string, lines?: string[]): OcrBlockLike {
  return {
    text,
    bounding: region,
    lines: lines?.map((t) => ({ text: t, bounding: region })),
  };
}

describe('scorePlateText', () => {
  it('rejects strings outside plate length', () => {
    expect(scorePlateText('AB1')).toBe(0);
    expect(scorePlateText('ABCDEFGHI')).toBe(0);
  });

  it('prefers mixed alphanumeric plate patterns', () => {
    expect(scorePlateText('9JRI205')).toBeGreaterThan(scorePlateText('JIMMYS'));
    expect(scorePlateText('ABC1234')).toBeGreaterThanOrEqual(12);
  });
});

describe('isStateText', () => {
  it('flags state names and slogan words', () => {
    expect(isStateText('CALIFORNIA')).toBe(true);
    expect(isStateText('EMPIRESTATE')).toBe(true);
  });

  it('passes plate-like strings', () => {
    expect(isStateText('9JRI205')).toBe(false);
  });
});

describe('findPlateInBlocks', () => {
  it('picks the plate over state branding text', () => {
    const found = findPlateInBlocks([
      block('CALIFORNIA', ['CALIFORNIA']),
      block('9JRI205', ['9JRI205']),
      block('DMV.CA.GOV', ['DMV.CA.GOV']),
    ]);
    expect(found?.text).toBe('9JRI205');
  });

  it('joins adjacent tokens split by OCR', () => {
    const found = findPlateInBlocks([block('LXE 1867', ['LXE 1867'])]);
    expect(found?.text).toBe('LXE1867');
  });

  it('joins split Idaho plate chunks by geometry even when blocks arrive right-first', () => {
    const right = { left: 150, top: 10, width: 180, height: 70 };
    const left = { left: 20, top: 8, width: 80, height: 72 };
    const found = findPlateInBlocks([
      { text: 'AC392', bounding: right },
      { text: '8B', bounding: left },
    ]);
    expect(found?.text).toBe('8BAC392');
    expect(found?.region).toEqual({ left: 20, top: 8, width: 310, height: 72 });
  });

  it('recovers a spaced leading chunk on a second Idaho format', () => {
    const found = findPlateInBlocks([
      { text: 'WJ785', bounding: { left: 180, top: 20, width: 190, height: 80 } },
      { text: '1A', bounding: { left: 30, top: 18, width: 90, height: 82 } },
    ]);
    expect(found?.text).toBe('1AWJ785');
  });

  it('keeps a complete spaced serial returned inside one OCR block', () => {
    const found = findPlateInBlocks([
      { text: 'B8 AC392', bounding: { left: 20, top: 10, width: 320, height: 90 } },
    ]);
    expect(found?.text).toBe('B8AC392');
  });

  it('returns null when no plate-like text exists', () => {
    expect(findPlateInBlocks([block('DEALERSHIP AUTO', ['DEALERSHIP AUTO'])])).toBeNull();
    expect(findPlateInBlocks([])).toBeNull();
  });
});
