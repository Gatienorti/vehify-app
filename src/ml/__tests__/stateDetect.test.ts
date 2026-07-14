import { detectSlogan, detectState, levenshtein } from '../stateDetect';

describe('levenshtein', () => {
  it('measures edit distance', () => {
    expect(levenshtein('CALIFORNIA', 'CALIFORNIA')).toBe(0);
    expect(levenshtein('CALIFORNIA', 'CALIF0RNIA')).toBe(1);
    expect(levenshtein('', 'ABC')).toBe(3);
  });
});

describe('detectState', () => {
  it('matches an exact state name', () => {
    expect(detectState('CALIFORNIA 9JRI205 DMV')).toBe('CA');
  });

  it('matches a two-word state name, spaced or concatenated', () => {
    expect(detectState('NEW YORK ABC1234')).toBe('NY');
    expect(detectState('NEWYORK ABC1234')).toBe('NY');
  });

  it('fuzzy-matches OCR errors in state names', () => {
    expect(detectState('CALIF0RNIA')).toBe('CA'); // O → 0
    expect(detectState('TEXAZ TRUCK')).toBe('TX');
  });

  it('matches unambiguous 2-letter codes as standalone words', () => {
    expect(detectState('NY 12345')).toBe('NY');
  });

  it('ignores ambiguous English-word codes', () => {
    expect(detectState('IN GOD WE TRUST')).toBeNull();
    expect(detectState('OK USED CARS')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(detectState('ABC1234 SMITH MOTORS')).toBeNull();
    expect(detectState('')).toBeNull();
  });
});

describe('detectSlogan', () => {
  it('matches known slogans', () => {
    expect(detectSlogan('THE EMPIRE STATE ABC1234')).toBe('NY');
    expect(detectSlogan('FIRST IN FLIGHT XYZ789')).toBe('NC');
    expect(detectSlogan('SUNSHINE STATE')).toBe('FL');
  });

  it('matches concatenated slogans', () => {
    expect(detectSlogan('EMPIRESTATE')).toBe('NY');
  });

  it('fuzzy-matches long slogans with OCR errors', () => {
    expect(detectSlogan('FIRST IN FLIGH7')).toBe('NC');
  });

  it('returns null when nothing matches', () => {
    expect(detectSlogan('9JRI205')).toBeNull();
  });
});
