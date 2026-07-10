import { isValidVin, maskVin, normalizeVin, validateVin } from '../vin';

describe('vin', () => {
  it('accepts a valid 17-char VIN', () => {
    expect(isValidVin('1HGCV1F30MA000000')).toBe(true);
  });

  it('normalizes whitespace and case', () => {
    expect(normalizeVin(' 1hgcv1f30ma000000 ')).toBe('1HGCV1F30MA000000');
  });

  it('rejects wrong length', () => {
    expect(validateVin('123')).toEqual({ valid: false, error: 'VIN must be 17 characters.' });
  });

  it('rejects I, O, Q', () => {
    expect(validateVin('1HGCV1F30MA00000I')).toEqual({
      valid: false,
      error: 'VIN cannot contain I, O, or Q.',
    });
  });

  it('masks all but the first 8 characters', () => {
    expect(maskVin('1HGCV1F30MA000000')).toBe('1HGCV1F3*********');
  });
});
