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

    it('parses the VIN from an AAMVA registration barcode via the VAD tag', () => {
      // Real (full) payload from a NY temp registration PDF417. Two traps it
      // must dodge: the header window "620042ZR02040015Z" passes the ISO
      // checksum by luck, and the real VIN hides mid-payload behind the VAD
      // element tag — which is the ONLY thing we trust in these blobs.
      const payload =
        '@\n\t\rAAMVA36001005VH00670058RG01250037ZV01620042ZR02040015ZZ02190013VH\nVAD7SAYGDEE6PA163838\nVAKTESL\nVAL23\rRG\nRAMLXE1867 \rZZ\nZZZ199706\r';
      expect(extractVinFromBarcode(payload)).toBe('7SAYGDEE6PA163838');
    });

    it('never window-scans non-AAMVA payloads (checksum-lucky junk)', () => {
      // Long blob: the lucky header window must NOT surface, even though it
      // passes the check digit.
      expect(
        extractVinFromBarcode('@\nXXDATA36001005VH00670058RG01250037ZV01620042ZR02040015ZZ0'),
      ).toBeNull();
      // Real field case: an 18-char sticker doc-number whose 17-char window
      // "40805611116ELU395" passes the checksum by luck. Only exact-17 (or
      // wrapper-stripped exact-17) payloads are VINs.
      expect(extractVinFromBarcode('40805611116ELU3950')).toBeNull();
    });

    it('returns null when there is no valid VIN', () => {
      expect(extractVinFromBarcode('HELLO123')).toBeNull();
    });

    it('pulls the VIN out of a dealer QR URL (token-boundary, not windows)', () => {
      expect(extractVinFromBarcode(`https://dealer.example.com/inventory?vin=${VIN}&lot=42`)).toBe(VIN);
      expect(extractVinFromBarcode(`WMI:1HG\nVIN ${VIN}\nCOLOR BLK`)).toBe(VIN);
    });

    it('token rule never revives the AAMVA junk slice', () => {
      // The lucky window lives inside a 32-char token — token-exact matching
      // cannot surface it.
      expect(
        extractVinFromBarcode('@\nXXDATA36001005VH00670058RG01250037ZV01620042ZR02040015ZZ0'),
      ).toBeNull();
    });

    it('handles lowercase and padded payloads', () => {
      expect(extractVinFromBarcode(` ${VIN.toLowerCase()} `)).toBe(VIN);
      expect(extractVinFromBarcode(`*${VIN}*`)).toBe(VIN);
    });
  });
});
