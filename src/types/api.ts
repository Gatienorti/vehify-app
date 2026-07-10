import type { BasicReport, LookupSource, PremiumReport, Vehicle } from './vehicle';

/** Request/response contracts mirror the Laravel backend (../vehify-web, spec §17). */

export interface PlateLookupRequest {
  plate: string;
  state: string;
}

export interface PlateLookupResponse {
  source: LookupSource;
  lastVerifiedAt: string; // ISO date
  isLiveVerified: boolean;
  vehicle: Vehicle;
}

export interface PlateRefreshRequest {
  plate: string;
  state: string;
  reason: 'user_rejected_cached_match' | 'stale_cache';
}

export interface VinLookupRequest {
  vin: string;
}

export interface VinLookupResponse {
  vehicle: Vehicle;
}

export type BasicVehicleResponse = BasicReport;

export interface PurchaseStartRequest {
  vin: string;
  productId: string;
}

export interface PurchaseStartResponse {
  purchaseToken: string;
}

export interface PurchaseConfirmRequest {
  purchaseToken: string;
  appStoreTransactionId: string;
  platform: 'ios' | 'android';
}

export interface PurchaseConfirmResponse {
  reportId: string;
}

export type ReportResponse = PremiumReport & { id: string };
