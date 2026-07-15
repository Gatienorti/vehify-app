import { parseOptionalPositiveInt } from '../number';

describe('parseOptionalPositiveInt', () => {
  it('parses plain digits', () => {
    expect(parseOptionalPositiveInt('78200')).toBe(78200);
  });

  it('strips separators and currency symbols', () => {
    expect(parseOptionalPositiveInt('78,200')).toBe(78200);
    expect(parseOptionalPositiveInt('$18,500')).toBe(18500);
    expect(parseOptionalPositiveInt(' 18 500 ')).toBe(18500);
  });

  it('returns undefined for empty, zero, and garbage input', () => {
    expect(parseOptionalPositiveInt('')).toBeUndefined();
    expect(parseOptionalPositiveInt('0')).toBeUndefined();
    expect(parseOptionalPositiveInt('abc')).toBeUndefined();
    expect(parseOptionalPositiveInt('$')).toBeUndefined();
  });
});
