/**
 * Conservative standard passenger-plate masks. Specialty and vanity plates
 * intentionally fall through unchanged; this is only an ambiguity resolver.
 *
 * D = digit, L = letter.
 */
const STANDARD_MASKS: Partial<Record<string, readonly string[]>> = {
  // Current standard passenger formats plus common recent formats that remain
  // valid on the road. Source reviewed 2026-07-25:
  // https://en.wikipedia.org/wiki/United_States_license_plate_designs_and_serial_formats
  // These are ambiguity hints only—never validation rules.
  AL: ['DLDDDDD', 'DDLDDDD'],
  AK: ['LLLDDD'],
  // Arizona's current X positions are randomized; recent deterministic formats
  // remain useful hints for older plates that are still on the road.
  AZ: ['LLLDDDD', 'DDDLLL'],
  AR: ['LLLDDL', 'DDDLLL'],
  CA: ['DDDLLLD', 'DLLLDDD'],
  CO: ['LLLLDD', 'LLLDDD', 'DDDLLL'],
  CT: ['LLDDDDD', 'DLLLLD', 'DDDLLL'],
  DE: ['DDDDDD'],
  DC: ['LLDDDD', 'DDDDDD'],
  FL: [
    'LLLLDD',
    'LLDDDL',
    'DDDLLL',
    'DDDDLL',
    'LDDDLL',
    'LLDLDD',
    'LDDDDL',
    'LLLDDD',
  ],
  GA: ['LLLDDDD', 'LLLDLL', 'LLDLLL'],
  HI: ['LLLDDD'],
  ID: [
    'LDDDDL',
    'LLDDDL',
    'LLLDDL',
    'DLDDDDL',
    'DLLDDDL',
    'DLLLDDL',
    'DLLLLDL',
    'DDLDDDDL',
    'DDLLDDDL',
    'DLLLDDD',
  ],
  IL: ['LLDDDDD'],
  IN: ['DDDL', 'DDDLL', 'DDDLLL', 'LLLDDD'],
  IA: ['LLLDDD'],
  KS: ['DDDDLLL'],
  KY: ['LDLDDD', 'LLLDDD'],
  LA: ['DDDLLL'],
  ME: ['DDDLLL'],
  MD: ['DLLDDDD'],
  MA: ['DLLLDD', 'DDDLDD', 'DDDLLL', 'DDDDLL', 'DDLDDL', 'DDDLLD', 'DLLDDD'],
  MI: ['LLLDDDD', 'DDLLLD', 'DLLLDD', 'LLLDDD'],
  MN: ['DDDLLL', 'LLLDDD'],
  MS: ['LLLDDD'],
  MO: ['LLDLDL'],
  MT: ['DLLDDDD', 'DDLLDDD', 'DDDDDDL', 'LLLDDD'],
  NE: ['DLDDDD', 'DLLDDD', 'DDLDDD', 'DDLLDD', 'LLLDDD'],
  NV: ['DDDDLD', 'DDDLDD', 'DDLDDD', 'DDDLLL'],
  NH: ['DDDDDDD', 'DDDDDD'],
  NJ: ['LDDLLL', 'LLLDDL', 'LLDDDL', 'LLLDDDD'],
  NM: ['DDDLLL', 'LLLDDD', 'LLLLDD'],
  NY: ['LLLDDDD'],
  NC: ['LLLDDD', 'LLLDDDD'],
  ND: ['DDDLLL'],
  OH: ['LLLDDDD'],
  OK: ['LLLDDD'],
  OR: ['DDDLLL', 'LLLDDD'],
  PA: ['LLLDDDD'],
  RI: ['DLLDDD'],
  SC: ['DDDLLL', 'DDDDLL'],
  SD: ['DLDDDD', 'DLLDDD', 'DDLDDD'],
  TN: ['LLLDDDD', 'DDDLLLL'],
  // TxDMV specifies both ABC-1234 and 123-ABCD for passenger/truck plates.
  TX: ['LLLDDDD', 'DDDLLLL'],
  UT: ['LDDDLL', 'DLLLD', 'DLDLL'],
  VT: ['LLLDDD', 'DDLLD', 'DLLDD', 'DDDLD', 'DLDDD'],
  VA: ['LLLDDDD'],
  WA: ['LLLDDDD', 'DDDLLL'],
  WV: ['LDLDDDD', 'LLLDDDD'],
  WI: ['LLLDDDD', 'DDDLLL'],
  WY: ['DLDDDL', 'DDLDDDL', 'DLDDDD', 'DDLDDDD'],
};

const AS_DIGIT: Record<string, string> = {
  O: '0',
  Q: '0',
  I: '1',
  Z: '2',
  S: '5',
  B: '8',
  G: '6',
};

const AS_LETTER: Record<string, string> = {
  '0': 'O',
  '1': 'I',
  '2': 'Z',
  '5': 'S',
  '8': 'B',
  '6': 'G',
};

function applyMask(
  plate: string,
  mask: string,
): { plate: string; changes: number } | null {
  if (plate.length !== mask.length) return null;
  let resolved = '';
  let changes = 0;

  for (let i = 0; i < mask.length; i++) {
    const raw = plate[i]!;
    const expected = mask[i]!;
    if (expected === 'D') {
      if (/[0-9]/.test(raw)) {
        resolved += raw;
      } else if (AS_DIGIT[raw]) {
        resolved += AS_DIGIT[raw];
        changes++;
      } else {
        return null;
      }
    } else if (/[A-Z]/.test(raw)) {
      resolved += raw;
    } else if (AS_LETTER[raw]) {
      resolved += AS_LETTER[raw];
      changes++;
    } else {
      return null;
    }
  }

  return { plate: resolved, changes };
}

/** Common plate shapes that are already plausible without state coercion. */
function hasPlausibleShape(plate: string): boolean {
  return (
    /^[A-Z]{2,3}[0-9]{3,4}$/.test(plate) ||
    /^[0-9]{3,4}[A-Z]{2,3}$/.test(plate) ||
    /^[0-9][A-Z]{3}[0-9]{3}$/.test(plate) ||
    /^[A-Z][0-9]{2,3}[A-Z]{3}$/.test(plate)
  );
}

/**
 * Resolve font twins only when a detected state's standard serial mask fully
 * explains the candidate. Unknown states and nonmatching formats are untouched.
 */
export function resolvePlateForState(
  plate: string,
  state: string | null,
  evidence: readonly string[] = [],
): string {
  if (!state) return plate;
  let candidate = plate;

  // Idaho's tall, narrow B is repeatedly read as R or 8. Only correct an R
  // when another independent same-length read saw B/8 at that exact position;
  // a genuine R with no conflicting evidence remains R.
  if (state === 'ID' && candidate.length === 7) {
    candidate = candidate
      .split('')
      .map((char, index) => {
        if (char !== 'R') return char;
        const sawBTwin = evidence.some(
          (read) => read.length === candidate.length && /[B8]/.test(read[index] ?? ''),
        );
        return sawBTwin ? 'B' : char;
      })
      .join('');
  }

  // OCR already produced a widely-issued plate shape. A state may also issue
  // specialty or vanity serials, so do not force it into the default mask.
  if (hasPlausibleShape(candidate)) return candidate;
  const masks = STANDARD_MASKS[state];
  if (!masks) return candidate;

  const matches = masks
    .map((mask) => applyMask(candidate, mask))
    .filter((result): result is { plate: string; changes: number } => result !== null)
    .sort((a, b) => a.changes - b.changes);

  const bestChanges = matches[0]?.changes;
  if (bestChanges === undefined) return candidate;
  const bestPlates = new Set(
    matches.filter((match) => match.changes === bestChanges).map((match) => match.plate),
  );
  // Several state formats explain the OCR equally well but imply different
  // characters. That is genuine ambiguity, so preserve the OCR result for the
  // user's editable confirmation instead of guessing.
  return bestPlates.size === 1 ? [...bestPlates][0]! : candidate;
}
