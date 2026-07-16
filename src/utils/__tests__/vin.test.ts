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

    it('rejects DMV/AAMVA document blobs outright (the temp-registration bug)', () => {
      // Real payload from a NY temp registration: the window
      // "620042ZR02040015Z" passes the ISO checksum by luck. Long payloads
      // offer dozens of windows, so a lucky slice is near-guaranteed —
      // document barcodes are never trusted as VIN sources.
      expect(
        extractVinFromBarcode('@\nAAMVA36001005VH00670058RG01250037ZV01620042ZR02040015ZZ0'),
      ).toBeNull();
      // Even a blob CONTAINING a real VIN is rejected — length is the filter.
      expect(extractVinFromBarcode(`ANSI AAMVA36001106VH00DL123 ${VIN} DCS9982025`)).toBeNull();
    });

    it('returns null when there is no valid VIN', () => {
      expect(extractVinFromBarcode('HELLO123')).toBeNull();
    });
  });
});
