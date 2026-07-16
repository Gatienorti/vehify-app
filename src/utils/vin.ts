/** VIN rules (spec §7): 17 chars, uppercase, excludes I, O, Q. */

const VIN_LENGTH = 17;
const INVALID_CHARS = /[IOQ]/;
const VALID_VIN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(raw: string): string {
  return raw.replace(/\s/g, '').toUpperCase();
}

export interface VinValidation {
  valid: boolean;
  error?: string;
}

export function validateVin(raw: string): VinValidation {
  const vin = normalizeVin(raw);
  if (vin.length !== VIN_LENGTH) {
    return { valid: false, error: `VIN must be ${VIN_LENGTH} characters.` };
  }
  if (INVALID_CHARS.test(vin)) {
    return { valid: false, error: 'VIN cannot contain I, O, or Q.' };
  }
  if (!VALID_VIN.test(vin)) {
    return { valid: false, error: 'VIN contains invalid characters.' };
  }
  return { valid: true };
}

export function isValidVin(raw: string): boolean {
  return validateVin(raw).valid;
}

/**
 * Pull a valid 17-char VIN out of a scanned barcode payload. VIN barcodes
 * (Code 39/128) sometimes carry start/stop indicators or extra characters, so
 * we accept the whole string or any valid 17-char VIN substring. Returns the
 * normalized VIN, or null if none is found.
 */
export function extractVinFromBarcode(raw: string): string | null {
  // AAMVA document barcodes (registration cards' PDF417): the VIN lives in
  // the VH (vehicle) subfile under element tag "VAD" — parse the tag
  // explicitly, checksum-verified. NEVER window-scan these blobs: with
  // dozens of 17-char windows the ISO checksum (rejects only ~10/11)
  // statistically guarantees a junk hit ("620042ZR02040015Z").
  const aamva = raw.toUpperCase().match(/VAD([A-HJ-NPR-Z0-9]{17})/);
  if (aamva && hasValidCheckDigit(aamva[1]!)) return aamva[1]!;

  const s = normalizeVin(raw);
  // Otherwise a payload is only trusted when it IS a VIN (Tesla QR, door-jamb
  // Code39 with 'I' wrappers) — a few chars of slack at most. Long non-AAMVA
  // blobs are rejected outright, per the window-scan hazard above.
  if (s.length > 21) return null;
  if (isValidVin(s) && hasValidCheckDigit(s)) return s;
  for (let i = 0; i + 17 <= s.length; i++) {
    const w = s.slice(i, i + 17);
    if (isValidVin(w) && hasValidCheckDigit(w)) return w;
  }
  return null;
}

/**
 * ISO 3779 check digit (VIN position 9, mandatory on US/Canada vehicles).
 * Each character maps to a value, is weighted by position, summed mod 11
 * (10 → 'X'). Random 17-char strings fail this ~10/11 of the time, which is
 * what makes it a strong filter against OCR false positives.
 */
const VIN_CHAR_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function hasValidCheckDigit(raw: string): boolean {
  const vin = normalizeVin(raw);
  if (!isValidVin(vin)) return false;
  let sum = 0;
  for (let i = 0; i < VIN_LENGTH; i++) {
    const value = VIN_CHAR_VALUES[vin[i]!];
    if (value === undefined) return false;
    sum += value * VIN_WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  return vin[8] === expected;
}

/** Mask a VIN for display where full disclosure isn't needed (spec §10). */
export function maskVin(vin: string): string {
  const v = normalizeVin(vin);
  if (v.length < 8) return v;
  return `${v.slice(0, 8)}${'*'.repeat(v.length - 8)}`;
}
