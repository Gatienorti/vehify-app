import { extractVinFromBarcode, isValidVin, maskVin, normalizeVin, validateVin } from '../vin';

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

  describe('extractVinFromBarcode', () => {
    // Checksum-valid fixture (ISO 3779 check digit at position 9).
    const VIN = '1HGCM82633A004352';

    it('accepts a clean VIN payload', () => {
      expect(extractVinFromBarcode(VIN)).toBe(VIN);
    });

    it('pulls a VIN out of a wrapped Code 39 payload', () => {
      expect(extractVinFromBarcode(`I${VIN}I`)).toBe(VIN);
    });

    it('requires the check digit — VIN-shaped junk is rejected', () => {
      // Same VIN with position 9 tampered 3 → 4: format-valid, checksum-bad.
      expect(extractVinFromBarcode('1HGCM82634A004352')).toBeNull();
    });

    it('finds the real VIN inside a DMV AAMVA blob (the temp-registration bug)', () => {
      // PDF417 document barcodes are long payloads: header junk is VIN-shaped
      // ("AAMVA36001106VH00…") but fails the checksum; the true VIN sits
      // mid-payload and must be the one extracted.
      expect(extractVinFromBarcode(`ANSI AAMVA36001106VH00DL123 ${VIN} DCS9982025`)).toBe(VIN);
    });

    it('returns null when there is no valid VIN', () => {
      expect(extractVinFromBarcode('HELLO123')).toBeNull();
    });
  });
});
