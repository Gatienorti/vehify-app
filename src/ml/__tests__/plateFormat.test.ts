import { resolvePlateForState } from '../plateFormat';

describe('resolvePlateForState', () => {
  it('uses the California standard mask to resolve letter/digit twins', () => {
    expect(resolvePlateForState('IABCZ34', 'CA')).toBe('1ABC234');
  });

  it('uses common three-letter/four-digit masks conservatively', () => {
    expect(resolvePlateForState('ABCIZ34', 'NY')).toBe('ABC1234');
    expect(resolvePlateForState('A8C1234', 'TX')).toBe('ABC1234');
    expect(resolvePlateForState('IZ3A8CD', 'TX')).toBe('123ABCD');
  });

  it('leaves unknown states and nonstandard lengths untouched', () => {
    expect(resolvePlateForState('ABCIZ34', 'FL')).toBe('ABCIZ34');
    expect(resolvePlateForState('VANITY', 'CA')).toBe('VANITY');
  });

  it('does not rewrite an already-plausible specialty format for the state', () => {
    // Physical-device regression: OCR correctly produced GHU2019, and the old
    // CA mask over-corrected it to 6HUZ019.
    expect(resolvePlateForState('GHU2019', 'CA')).toBe('GHU2019');
    expect(resolvePlateForState('GWU2019', 'CA')).toBe('GWU2019');
  });

  it('uses cross-photo evidence for the Idaho B/R/8 font ambiguity', () => {
    expect(resolvePlateForState('8RAC392', 'ID', ['8RAC392', 'B8AC392'])).toBe('8BAC392');
    expect(resolvePlateForState('B8AC392', 'ID', ['B8AC392'])).toBe('8BAC392');
    expect(resolvePlateForState('1ARJ785', 'ID', ['1ARJ785', '1A8J785'])).toBe('1ABJ785');
    expect(resolvePlateForState('8RAC392', 'ID', ['8RAC392', '8RAC392'])).toBe('8RAC392');
  });

  it('supports current and previous California standard formats', () => {
    expect(resolvePlateForState('I23ABC1', 'CA')).toBe('123ABC1');
    expect(resolvePlateForState('IABCZ34', 'CA')).toBe('1ABC234');
  });

  it('uses representative mixed formats from other states', () => {
    expect(resolvePlateForState('ABCIZD', 'AR')).toBe('ABC12D');
    expect(resolvePlateForState('ABCDIZ', 'FL')).toBe('ABCD12');
    expect(resolvePlateForState('A8CIZ34', 'NY')).toBe('ABC1234');
  });
});
