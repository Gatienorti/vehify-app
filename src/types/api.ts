import type { BasicReport, LookupSource, PaidTier, ReportTier, Report, Vehicle } from './vehicle';

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

export interface PurchaseStartRequest {
  vin: string;
  tier: PaidTier;
  productId: string;
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

/**
 * Where a paid report's CONTENT is in its lifecycle. Confirm queues the build
 * on the backend and answers instantly with `generating`; the app polls
 * GET /report/{id} until it flips to `ready`. `failed` means the queued build
 * exhausted its retries — recover with the FREE POST /report/{id}/retry.
 */
export type ReportGenerationStatus = 'generating' | 'ready' | 'failed';

export interface PurchaseConfirmResponse {
  reportId: string;
  tier: PaidTier;
  /** Optional for older backends; treat absence as `ready` (legacy sync confirm). */
  status?: ReportGenerationStatus;
}

/**
 * Report credits (bought on the website — no Apple/Google cut — and spent in
 * the app). Balance is keyed by account/device on the backend. Anonymous
 * devices that never bought credits get 0. GET /api/credits.
 */
export interface CreditsResponse {
  balance: number;
}

/**
 * Redeem a report with credits instead of an in-app purchase. The backend is
 * authoritative on the credit COST (it knows what the buyer already owns — a
 * complete-history upgrade costs less than a from-scratch history) and on the
 * balance check; the app only sends intent. Returns the same shape as a paid
 * confirm, so the caller's post-purchase flow is identical.
 * POST /api/report/redeem.
 */
export interface RedeemReportRequest {
  vin: string;
  tier: PaidTier;
  /**
   * Client-stable key for this purchase attempt. A retry after a dropped
   * response reuses it so the backend returns the same report instead of
   * spending a second credit.
   */
  idempotencyKey?: string;
}

export type ReportResponse = Report & {
  id: string;
  status?: 'ready';
  /** When the content was last (re)generated — drives the stale-report banner. */
  generatedAt?: string | null;
};

/** GET /report/{id} while the queued build is still running (or failed). */
export interface ReportPendingResponse {
  id: string;
  reportId: string;
  tier: PaidTier;
  vin?: string;
  status: 'generating' | 'failed';
}

/** What GET /report/{id} actually returns — narrow with `isReportReady`. */
export type ReportFetchResponse = ReportResponse | ReportPendingResponse;

export function isReportReady(r: ReportFetchResponse | undefined): r is ReportResponse {
  return r !== undefined && (r.status === undefined || r.status === 'ready');
}

/** POST /report/{id}/refresh and /retry both answer with the poll-me payload. */
export type ReportRequeuedResponse = ReportPendingResponse;

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

/** Request a password-reset code by email. */
export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

/** Complete a reset with the emailed 6-digit code + a new password. */
export interface ResetPasswordRequest {
  email: string;
  code: string;
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

/**
 * GET /history — the server-authoritative lookup feed for the History tab
 * (owner = user_id when signed in, else the anonymous device). Nullable fields
 * are normalized to `HistoryEntry` (null → undefined) in the API transform.
 */
export interface HistoryFeedItem {
  id: string;
  vin: string;
  plate: string | null;
  state: string | null;
  lookupType: 'vin' | 'plate';
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  lookedUpAt: string;
  tier: ReportTier;
  reportId: string | null;
}

/** GET /purchases — the owner's paid reports, for a server-backed Restore. */
export interface PurchaseFeedItem {
  vin: string;
  tier: PaidTier;
  reportId: string;
  purchasedAt: string;
}
