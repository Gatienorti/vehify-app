import type {
  PlatePurchaseConfirmResponse,
  ReportResponse,
} from '../api';

/**
 * Contract-drift canary (docs/backend-contract.md, Report Tiers v2.1).
 * These fixtures type-check the FULL response shapes — if the app types
 * drift from the contract, `tsc`/jest fail here first with a readable diff
 * instead of deep inside a screen.
 */

const fullReport: ReportResponse = {
  id: '42',
  tier: 'complete_history',
  vehicle: { vin: '4T1B11HK5KU212345', year: 2019, make: 'TOYOTA', model: 'Camry' },
  analysis: {
    modelScore: { score: 82, band: 'green', reason: 'No open recalls or investigations.' },
    deal: { verdict: 'high', priceDelta: 1400, reason: 'Asking $1,400 over market value.' },
    askingPrice: 18500,
    buyScore: { score: 74, band: 'yellow', reason: 'One accident on file, mileage on trend.' },
    investigations: {
      total: 1,
      open: 1,
      items: [
        {
          actionNumber: 'PE25010',
          subject: 'Brake master cylinder',
          component: 'Service brakes',
          openedAt: '2025-02-01',
          closedAt: null,
          isOpen: true,
          recallCampaign: null,
        },
      ],
    },
    recommendation: 'Negotiate down before committing.',
    negotiationAdvice: 'Open at $16,200 — just under the market band.',
    maintenanceOutlook: '60k service due soon.',
    estimatedValue: 17800,
    valueLow: 16376,
    valueHigh: 19224,
    // Always null — no real MSRP/depreciation source exists (kept in the
    // contract for a future trim-MSRP provider, never fabricated).
    msrp: null,
    depreciationPct: null,
    suggestedOffer: 16020,
    buyerMileage: 78200,
    valueByMileage: [
      { mileage: 48200, estimate: 19900 },
      { mileage: 78200, estimate: 17800 },
    ],
    mileageHistory: [{ date: '2023-06', mileage: 31200, source: 'Title' }],
    rollbackDetected: false,
    openRecalls: [{ id: '23V123', summary: 'Fuel pump may fail.', component: 'Fuel system' }],
    complaintTrends: '47 owner complaints on file — most often about air bags.',
    manufacturerCommunications: 12,
    factoryEquipment: ['Heated front seats'],
    photoUrls: [],
    safety: { overall: 5, front_crash: 5, side_crash: 5, rollover: 4 },
    fuelEconomy: { combined_mpg: 32, city_mpg: 28, highway_mpg: 39, annual_fuel_cost: 1650 },
  },
  history: {
    accidents: 2,
    titleBrands: ['Salvage'],
    thefts: 0,
    odometerIssues: 1,
    owners: 3,
    auctionRecords: [{ date: '2022-11-04', location: 'Dallas, TX', price: 15200, photoUrls: [] }],
    serviceHistory: [{ date: '2021-06-12', description: 'Oil change', mileage: 38900 }],
  },
};

// Tier-3 report: buyScore null, no history, and NO odometer timeline —
// readings are history-class data with no real tier-3 source.
const analysisOnlyReport: ReportResponse = {
  ...fullReport,
  tier: 'buyers_analysis',
  analysis: {
    ...fullReport.analysis,
    buyScore: null,
    deal: { verdict: null, priceDelta: null, reason: 'Add the asking price for a verdict.' },
    mileageHistory: [],
    rollbackDetected: false,
  },
  history: null,
};

const plateHit: PlatePurchaseConfirmResponse = {
  purchaseId: 'pp_1',
  found: true,
  source: 'cache',
  lastVerifiedAt: '2026-05-02T00:00:00Z',
  isLiveVerified: false,
  vehicle: { vin: '4T1B11HK5KU212345' },
};

const plateMiss: PlatePurchaseConfirmResponse = {
  purchaseId: 'pp_2',
  found: false,
  vehicle: null,
};

describe('backend contract fixtures (v2.1)', () => {
  it('narrows the plate purchase union on `found`', () => {
    expect(plateHit.found && plateHit.vehicle.vin).toBe('4T1B11HK5KU212345');
    expect(plateMiss.found).toBe(false);
  });

  it('keeps the honesty split: tier-3 has null buyScore, tier-4 a real one', () => {
    expect(analysisOnlyReport.analysis.buyScore).toBeNull();
    expect(analysisOnlyReport.history).toBeNull();
    expect(fullReport.analysis.buyScore?.score).toBe(74);
    expect(fullReport.history?.accidents).toBe(2);
  });
});
