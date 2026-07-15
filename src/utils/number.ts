/**
 * Parse loose numeric user input ("78,200", "$18,500") into a positive
 * integer. Returns undefined for empty/zero/garbage — optional inputs never
 * block a purchase, they just skip the field.
 */
export function parseOptionalPositiveInt(text: string): number | undefined {
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return undefined;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
