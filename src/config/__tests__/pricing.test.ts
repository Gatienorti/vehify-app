import { creditCostFor, creditLabel } from '../pricing';

describe('creditCostFor', () => {
  it('Buyer Report costs 1 credit', () => {
    expect(creditCostFor('buyers_analysis')).toBe(1);
  });

  it('full Complete History (from scratch) costs 2 credits', () => {
    expect(creditCostFor('complete_history')).toBe(2);
  });

  it('Complete History as an upgrade is discounted to 1 credit', () => {
    expect(creditCostFor('complete_history', true)).toBe(1);
  });

  it('the upgrade flag does not discount the Buyer Report', () => {
    expect(creditCostFor('buyers_analysis', true)).toBe(1);
  });
});

describe('creditLabel', () => {
  it('singularizes one credit', () => {
    expect(creditLabel(1)).toBe('Use 1 credit');
  });

  it('pluralizes multiple credits', () => {
    expect(creditLabel(2)).toBe('Use 2 credits');
  });
});
