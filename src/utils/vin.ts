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
  const s = normalizeVin(raw);
  if (isValidVin(s)) return s;
  const matches = s.match(/[A-HJ-NPR-Z0-9]{17}/g);
  if (matches) {
    for (const m of matches) {
      if (isValidVin(m)) return m;
    }
  }
  return null;
}

/** Mask a VIN for display where full disclosure isn't needed (spec §10). */
export function maskVin(vin: string): string {
  const v = normalizeVin(vin);
  if (v.length < 8) return v;
  return `${v.slice(0, 8)}${'*'.repeat(v.length - 8)}`;
}
