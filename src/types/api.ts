import type { BasicReport, LookupSource, PaidTier, Report, Vehicle } from './vehicle';

/** Request/response contracts mirror the Laravel backend (../vehify-web, spec §17). */

export interface PlateLookupRequest {
  plate: string;
  state: string;
}

export interface PlateLookupResponse {
  source: LookupSource;
  /** ISO date; the backend may return null for a never-verified record. */
  lastVerifiedAt: string | null;
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

/** Paid $0.25 plate lookup (tier 2) — two-phase like report purchases. */
export interface PlatePurchaseStartRequest {
  plate: string;
  state: string;
  productId: string;
}

export interface PlatePurchaseStartResponse {
  purchaseToken: string;
}

export interface PlatePurchaseConfirmRequest {
  purchaseToken: string;
  platform: 'ios' | 'android';
  appStoreTransactionId: string;
}

/**
 * Confirm runs the plate→VIN lookup inline. Discriminated on `found`: a hit
 * carries the full PlateLookupResponse shape (hand it straight to
 * VehicleMatch); a miss keeps the paid record and steers the user to VIN
 * entry. Mirrors PlatePurchaseController@confirm in ../vehify-web.
 */
export type PlatePurchaseConfirmResponse =
  | ({ purchaseId: string; found: true } & PlateLookupResponse)
  | { purchaseId: string; found: false; vehicle: null };

export interface PurchaseStartRequest {
  vin: string;
  tier: PaidTier;
  productId: string;
  /** Optional buyer-entered odometer reading (miles) — the buyer is at the car. */
  mileage?: number;
  /** Optional seller's asking price (dollars) — powers the Deal verdict. */
  askingPrice?: number;
}

export interface PurchaseStartResponse {
  purchaseToken: string;
}

export interface PurchaseConfirmRequest {
  purchaseToken: string;
  appStoreTransactionId: string;
  platform: 'ios' | 'android';
  tier: PaidTier;
}

export interface PurchaseConfirmResponse {
  reportId: string;
  tier: PaidTier;
}

export type ReportResponse = Report & {
  id: string;
  /** When the content was last (re)generated — drives the stale-report banner. */
  generatedAt?: string | null;
};

/**
 * Sign in with Apple / Google → Sanctum bearer token. `identityToken` is the
 * JWT from the native sign-in sheet. Send `name` when Apple provides it —
 * that only happens on the very first authorization.
 */
export interface SocialSignInRequest {
  provider: 'apple' | 'google';
  identityToken: string;
  name?: string;
}

export interface SocialSignInResponse {
  /** Use as `Authorization: Bearer <token>` on account endpoints. */
  token: string;
  user: { id: number; name: string; email: string };
}

/** All sign-in paths (social, register, login) return the same token + user. */
export type AuthResponse = SocialSignInResponse;

/** Email + password account creation (the non-social path). */
export interface EmailRegisterRequest {
  name?: string;
  email: string;
  password: string;
}

/** Email + password login. */
export interface EmailLoginRequest {
  email: string;
  password: string;
}

/**
 * POST /history/sync — claim anonymous device activity onto the account and
 * copy the local history up. `deviceId` is also sent as X-Device-Id; the
 * backend accepts either. Items are snake_case to match the backend contract.
 */
export interface HistorySyncItem {
  lookup_type: 'vin' | 'plate';
  vin?: string;
  plate?: string;
  state?: string;
  looked_up_at: string;
}

export interface HistorySyncRequest {
  deviceId?: string;
  items: HistorySyncItem[];
}

export interface HistorySyncResponse {
  synced: number;
  claimed: number;
  total: number;
}

export interface LogoutResponse {
  message?: string;
}
