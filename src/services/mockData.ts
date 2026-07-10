import type {
  BasicVehicleResponse,
  PlateLookupResponse,
  ReportResponse,
  VinLookupResponse,
} from '../types/api';
import { normalizeVin } from '../utils/vin';
import { scoreBand, type Vehicle } from '../types/vehicle';

/**
 * In-app mock provider used while the Laravel backend is being built
 * (USE_MOCKS in config/env). Deterministic — derived from the VIN/plate so the
 * same input always yields the same vehicle. Replace with real backend calls,
 * NOT by calling a provider from the app (spec §19).
 */

const MAKES = ['Honda', 'Toyota', 'Ford', 'Chevrolet', 'Nissan', 'Mazda'];
const MODELS: Record<string, string[]> = {
  Honda: ['Accord', 'Civic', 'CR-V'],
  Toyota: ['Camry', 'Corolla', 'RAV4'],
  Ford: ['F-150', 'Escape', 'Focus'],
  Chevrolet: ['Malibu', 'Equinox', 'Silverado'],
  Nissan: ['Altima', 'Rogue', 'Sentra'],
  Mazda: ['Mazda3', 'CX-5', 'Mazda6'],
};
const TRIMS = ['Sport', 'SE', 'LX', 'EX', 'Touring'];
const COLORS = ['Black', 'White', 'Silver', 'Blue', 'Red'];

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length] as T;
}

export function mockVehicle(vin: string): Vehicle {
  const v = normalizeVin(vin);
  const h = hash(v);
  const make = pick(MAKES, h);
  const model = pick(MODELS[make] ?? ['Model'], h >> 3);
  return {
    vin: v,
    year: 2015 + (h % 10),
    make,
    model,
    trim: pick(TRIMS, h >> 5),
    color: pick(COLORS, h >> 7),
    bodyStyle: 'Sedan',
    engine: '2.0L I4',
    transmission: 'Automatic',
    driveType: 'FWD',
    fuelType: 'Gasoline',
    manufacturer: make,
  };
}

export function mockVinLookup(vin: string): VinLookupResponse {
  return { vehicle: mockVehicle(vin) };
}

export function mockPlateLookup(plate: string, state: string): PlateLookupResponse {
  const seededVin = `MOCK${state}${plate}`.padEnd(17, '0').slice(0, 17).toUpperCase();
  return {
    source: 'live',
    lastVerifiedAt: new Date().toISOString().slice(0, 10),
    isLiveVerified: true,
    vehicle: mockVehicle(seededVin),
  };
}

export function mockBasic(vin: string): BasicVehicleResponse {
  const vehicle = mockVehicle(vin);
  const h = hash(vehicle.vin);
  const hasRecall = h % 3 === 0;
  return {
    vehicle,
    recalls: hasRecall
      ? [{ id: 'R1', summary: 'Fuel pump may fail.', component: 'Fuel System' }]
      : [],
    estimatedValue: 12000 + (h % 20000),
    summary: hasRecall
      ? 'This vehicle has an open recall to review before purchase.'
      : 'No open recalls found. Looks like a clean basic record.',
  };
}

export function mockReport(vin: string, reportId: string): ReportResponse {
  const vehicle = mockVehicle(vin);
  const h = hash(vehicle.vin);
  const score = 55 + (h % 45);
  return {
    id: reportId,
    vehicle,
    buyScore: {
      score,
      band: scoreBand(score),
      reason:
        score >= 80
          ? 'No major title, theft, or odometer issues found in available records.'
          : score >= 60
            ? 'Mostly clean, but at least one item is worth a closer look.'
            : 'Records show issues that materially affect this vehicle. Proceed carefully.',
    },
    titleBrands: score < 60 ? ['Salvage'] : [],
    accidents: h % 3,
    thefts: score < 60 && h % 5 === 0 ? 1 : 0,
    odometerIssues: score < 70 && h % 4 === 0 ? 1 : 0,
    owners: 1 + (h % 4),
    recommendation:
      score >= 80
        ? 'This appears to be a strong candidate based on the available records.'
        : score >= 60
          ? 'This vehicle is worth considering, but verify the flagged items in person.'
          : 'We found records that suggest higher risk. Consider other options or a professional inspection.',
  };
}
