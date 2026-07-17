import type { PurchaseConfirmResponse, ReportFetchResponse, ReportResponse } from '../api';
import { isReportReady } from '../api';

/**
 * Contract-drift canary (docs/backend-contract.md, Report Tiers v2.1).
 * These fixtures type-check the FULL response shapes — if the app types
 * drift from the contract, `tsc`/jest fail here first with a readable diff
 * instead of deep inside a screen.
 */

const fullReport: ReportResponse = {
  id: '42',
  status: 'ready',
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
    // The history report's own valuation — Premium only, second anchor.
    carfaxValue: { amount: 9680, label: 'CARFAX Retail Value' },
    // Real MSRP (carapi.app trims, ~2015–2020); null outside that coverage.
    msrp: 27400,
    depreciationPct: 35,
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
    // Recent asking prices (vendor-neutral) — accumulating pool, refreshed
    // every ~7 days, points age out at ~60; each stamped with its seen date.
    listingComps: {
      count: 4,
      low: 16995,
      high: 23143,
      average: 20528,
      asOf: '2026-07-16',
      items: [
        {
          title: '2019 Toyota Camry XSE',
          price: 18980,
          mileage: 136323,
          titleStatus: 'Clean',
          seenAt: '2026-07-16',
          url: 'https://example.com/itm/1',
        },
        {
          title: '2019 Toyota Camry LE',
          price: 16995,
          mileage: null,
          titleStatus: null,
          seenAt: '2026-07-09',
          url: null,
        },
      ],
    },
    photoUrls: [],
    safety: { overall: 5, front_crash: 5, side_crash: 5, rollover: 4 },
    fuelEconomy: {
      combined_mpg: 32,
      city_mpg: 28,
      highway_mpg: 39,
      annual_fuel_cost: 1650,
      // Driver-reported ("Your MPG", 3+ drivers) + this week's pump price.
      real_world_mpg: 30.4,
      real_world_sample: 12,
      annual_fuel_cost_current: 1450,
      gas_price_per_gallon: 3.09,
      gas_price_as_of: '2026-07-13',
    },
    // EV/plug-in only (null for gas cars) — incentives + charging density.
    evOwnership: {
      incentives: {
        jurisdiction: 'NY',
        count: 7,
        highlights: [{ title: 'Federal Qualified Plug-In Electric Vehicle Tax Credit', type: 'TAX' }],
      },
      charging: { stationCount: 240, dcFastCount: 38, radiusMiles: 25 },
    },
  },
  history: {
    accidents: 2,
    titleBrands: ['Salvage'],
    thefts: 0,
    odometerIssues: 1,
    owners: 3,
    auctionRecords: [{ date: '2022-11-04', location: 'Dallas, TX', price: 15200, photoUrls: [] }],
    serviceHistory: [{ date: '2021-06-12', description: 'Oil change', mileage: 38900 }],
    ownerDetails: [
      {
        owner: 1,
        purchasedYear: 2019,
        type: 'Personal',
        milesPerYear: 5022,
        events: 12,
        lengthOfOwnership: '17 yrs. 10 mo.',
        states: ['New York'],
        lastReportedOdometer: 88993,
      },
    ],
    // The report's own valuation + designations (all nullable — the vendor
    // suppresses the value on branded cars).
    historyBasedValue: {
      amount: 9680,
      label: 'CARFAX Retail Value',
      events: [
        { label: 'No Accidents Reported', direction: 'up' },
        { label: 'Open Recall', direction: 'down' },
      ],
    },
    autocheckScore: null,
    warranty: 'Original warranty estimated to have expired.',
    locations: ['New York'],
    highlights: ['CARFAX 1-Owner Vehicle'],
    lienRecords: [{ date: '2008-10-28', detail: 'Title issued or updated. Loan or lien reported' }],
    openRecallReported: true,
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

// Queued generation: confirm answers instantly with status=generating and
// the app polls GET /report/{id} until the payload flips to the full report.
const confirmGenerating: PurchaseConfirmResponse = {
  reportId: '42',
  tier: 'complete_history',
  status: 'generating',
};

const pollPending: ReportFetchResponse = {
  id: '42',
  reportId: '42',
  tier: 'complete_history',
  vin: '4T1B11HK5KU212345',
  status: 'generating',
};

describe('backend contract fixtures (v2.1)', () => {
  it('narrows the report poll union on status', () => {
    expect(confirmGenerating.status).toBe('generating');
    expect(isReportReady(pollPending)).toBe(false);
    expect(!isReportReady(pollPending) && pollPending.vin).toBe('4T1B11HK5KU212345');
    // A ready report (status present or legacy-absent) narrows to the full shape.
    expect(isReportReady(fullReport) && fullReport.analysis.recommendation).toBeTruthy();
    expect(isReportReady({ ...fullReport, status: undefined })).toBe(true);
  });

  it('keeps the honesty split: tier-3 has null buyScore, tier-4 a real one', () => {
    expect(analysisOnlyReport.analysis.buyScore).toBeNull();
    expect(analysisOnlyReport.history).toBeNull();
    expect(fullReport.analysis.buyScore?.score).toBe(74);
    expect(fullReport.history?.accidents).toBe(2);
    expect(fullReport.history?.historyBasedValue?.amount).toBe(9680);
    expect(fullReport.analysis.carfaxValue?.amount).toBe(9680);
    expect(fullReport.history?.ownerDetails?.[0].lengthOfOwnership).toBe('17 yrs. 10 mo.');
  });
});
