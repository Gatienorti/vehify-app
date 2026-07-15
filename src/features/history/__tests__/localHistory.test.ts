import { normalizeEntry } from '../localHistory';

const base = {
  id: '1',
  vin: '1HGCM82633A004352',
  lookupType: 'vin' as const,
  lookedUpAt: '2026-01-01T00:00:00Z',
};

describe('normalizeEntry (legacy history migration)', () => {
  it('keeps valid v2 tiers as-is', () => {
    expect(normalizeEntry({ ...base, tier: 'basic' }).tier).toBe('basic');
    expect(normalizeEntry({ ...base, tier: 'buyers_analysis', reportId: 'r1' })).toMatchObject({
      tier: 'buyers_analysis',
      reportId: 'r1',
    });
    expect(normalizeEntry({ ...base, tier: 'complete_history' }).tier).toBe('complete_history');
  });

  it("maps the legacy 'premium' tier to complete_history", () => {
    expect(normalizeEntry({ ...base, tier: 'premium', reportId: 'r1' })).toMatchObject({
      tier: 'complete_history',
      reportId: 'r1',
    });
  });

  it('maps the legacy isPremium flag to complete_history', () => {
    expect(normalizeEntry({ ...base, isPremium: true }).tier).toBe('complete_history');
  });

  it('falls back to basic (and drops reportId) for unknown tiers', () => {
    const entry = normalizeEntry({ ...base, tier: 'something_else', reportId: 'stale' });
    expect(entry.tier).toBe('basic');
    expect(entry.reportId).toBeUndefined();
  });

  it('strips the legacy isPremium key from migrated entries', () => {
    expect('isPremium' in normalizeEntry({ ...base, isPremium: true })).toBe(false);
  });
});
