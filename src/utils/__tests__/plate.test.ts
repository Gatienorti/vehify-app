import { isValidStateCode, normalizePlate } from '../plate';

describe('plate', () => {
  it('strips non-alphanumerics and uppercases', () => {
    expect(normalizePlate(' abc-1234 ')).toBe('ABC1234');
  });

  it('validates known state codes case-insensitively', () => {
    expect(isValidStateCode('ny')).toBe(true);
    expect(isValidStateCode('ZZ')).toBe(false);
  });
});
