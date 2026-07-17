import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL } from '../config/env';
import { getDeviceId } from '../config/deviceId';
import type { PaidTier } from '../types/vehicle';
import type { RootState } from '../store';
import type { HistoryEntry } from '../types/history';
import type {
  AuthResponse,
  BasicVehicleResponse,
  EmailLoginRequest,
  EmailRegisterRequest,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  HistoryFeedItem,
  HistorySyncRequest,
  HistorySyncResponse,
  LogoutResponse,
  PurchaseFeedItem,
  PlateLookupRequest,
  PlateLookupResponse,
  PlatePurchaseConfirmRequest,
  PlatePurchaseConfirmResponse,
  PlatePurchaseStartRequest,
  PlatePurchaseStartResponse,
  PlateRefreshRequest,
  PurchaseConfirmRequest,
  PurchaseConfirmResponse,
  PurchaseStartRequest,
  PurchaseStartResponse,
  ReportFetchResponse,
  ReportRequeuedResponse,
  SocialSignInRequest,
  SocialSignInResponse,
  VinLookupRequest,
  VinLookupResponse,
} from '../types/api';

/**
 * The ONLY place the app talks to the Laravel backend (../vehify-web) — and
 * the backend is the ONLY data source, mock or real: its provider layer serves
 * mock data until real providers are wired (spec §19). No in-app mocks.
 * Screens always consume these RTK Query hooks — never raw fetch.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_BASE_URL}/api`,
    // Anonymous device identity on every call — lets the backend keep history
    // and purchases for this phone before login (claimed at /history/sync).
    prepareHeaders: async (headers, { getState }) => {
      headers.set('X-Device-Id', await getDeviceId());
      // Attach the account token when signed in — account endpoints
      // (/user, /history/sync, /auth/logout) require it; anonymous calls omit it.
      const token = (getState() as RootState).auth.token;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ['VehicleBasic', 'Report', 'History', 'Purchases'],
  endpoints: (builder) => ({
    lookupVin: builder.mutation<VinLookupResponse, VinLookupRequest>({
      query: (body) => ({ url: '/lookup/vin', method: 'POST', body }),
      // The backend records this lookup in the server history — refresh the feed.
      invalidatesTags: ['History'],
    }),

    lookupPlate: builder.mutation<PlateLookupResponse, PlateLookupRequest>({
      query: (body) => ({ url: '/lookup/plate', method: 'POST', body }),
      invalidatesTags: ['History'],
    }),

    refreshPlate: builder.mutation<PlateLookupResponse, PlateRefreshRequest>({
      query: (body) => ({ url: '/lookup/plate/refresh', method: 'POST', body }),
    }),

    // Paid $0.25 plate lookup (tier 2). Two-phase mock IAP like reports;
    // confirm runs the plate→VIN lookup inline and returns the match (or
    // found:false on a no-hit — the paid record is kept server-side).
    startPlatePurchase: builder.mutation<PlatePurchaseStartResponse, PlatePurchaseStartRequest>({
      query: (body) => ({ url: '/plate/purchase/start', method: 'POST', body }),
    }),

    confirmPlatePurchase: builder.mutation<PlatePurchaseConfirmResponse, PlatePurchaseConfirmRequest>({
      query: (body) => ({ url: '/plate/purchase/confirm', method: 'POST', body }),
      invalidatesTags: ['History'],
    }),

    getVehicleBasic: builder.query<BasicVehicleResponse, string>({
      query: (vin) => `/vehicle/${vin}/basic`,
      providesTags: (_r, _e, vin) => [{ type: 'VehicleBasic', id: vin }],
    }),

    startPurchase: builder.mutation<PurchaseStartResponse, PurchaseStartRequest>({
      query: (body) => ({ url: '/report/purchase/start', method: 'POST', body }),
    }),

    confirmPurchase: builder.mutation<PurchaseConfirmResponse, PurchaseConfirmRequest>({
      query: (body) => ({ url: '/report/purchase/confirm', method: 'POST', body }),
      // A purchase changes the report, the history feed's tier badge, and the
      // owned-reports list.
      invalidatesTags: ['Report', 'History', 'Purchases'],
    }),

    // While the backend's queued build runs, this returns the small
    // {status: 'generating'} payload — poll it (pollingInterval at the call
    // site) until it flips to the full ready report.
    getReport: builder.query<ReportFetchResponse, { id: string; vin: string; tier: PaidTier }>({
      query: (arg) => `/report/${arg.id}`,
      providesTags: (_r, _e, arg) => [{ type: 'Report', id: arg.id }],
    }),

    // Regenerate a stale report's content (offered via the "X days old"
    // banner). Free while providers are mock/free. Queued: the response is
    // the generating payload and the report polls back to ready.
    refreshReport: builder.mutation<ReportRequeuedResponse, { id: string }>({
      query: (arg) => ({ url: `/report/${arg.id}/refresh`, method: 'POST' }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'Report', id: arg.id }],
    }),

    // FREE recovery when a queued build ends in status:'failed' — re-queues
    // the already-paid report's generation, never charges.
    retryReport: builder.mutation<ReportRequeuedResponse, { id: string }>({
      query: (arg) => ({ url: `/report/${arg.id}/retry`, method: 'POST' }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'Report', id: arg.id }],
    }),

    // --- Account (optional — the app works fully anonymously) ---

    // Sign in with Apple / Google. The native SDK yields an identity token;
    // the backend verifies it and returns a Sanctum bearer token + user.
    socialSignIn: builder.mutation<SocialSignInResponse, SocialSignInRequest>({
      query: (body) => ({ url: '/auth/social', method: 'POST', body }),
    }),

    // Email + password account creation / sign-in (the non-social path).
    registerEmail: builder.mutation<AuthResponse, EmailRegisterRequest>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),

    loginEmail: builder.mutation<AuthResponse, EmailLoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),

    // Password reset by emailed 6-digit code.
    forgotPassword: builder.mutation<ForgotPasswordResponse, ForgotPasswordRequest>({
      query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }),
    }),

    resetPassword: builder.mutation<AuthResponse, ResetPasswordRequest>({
      query: (body) => ({ url: '/auth/reset-password', method: 'POST', body }),
    }),

    // Revoke the current device's token server-side (other devices stay in).
    logout: builder.mutation<LogoutResponse, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),

    // Permanent account deletion (App Store 5.1.1(v) / Play policy): erases
    // the account + its synced history and revokes every session. Purchases
    // made on THIS device remain available to it (device-owned).
    deleteAccount: builder.mutation<LogoutResponse, void>({
      query: () => ({ url: '/user', method: 'DELETE' }),
      invalidatesTags: ['History', 'Purchases'],
    }),

    // Claim anonymous device activity onto the account + copy local history up.
    syncHistory: builder.mutation<HistorySyncResponse, HistorySyncRequest>({
      query: (body) => ({ url: '/history/sync', method: 'POST', body }),
      // A fresh account's claimed rows change the feed + owned reports.
      invalidatesTags: ['History', 'Purchases'],
    }),

    // --- Server-authoritative reads (the backend is the source of truth) ---

    // The lookup history feed for the History tab. Normalizes the server's
    // nullable fields to the app's HistoryEntry shape.
    getHistory: builder.query<HistoryEntry[], void>({
      query: () => '/history',
      transformResponse: (items: HistoryFeedItem[]): HistoryEntry[] =>
        items.map((i) => ({
          id: i.id,
          vin: i.vin,
          plate: i.plate ?? undefined,
          state: i.state ?? undefined,
          lookupType: i.lookupType,
          year: i.year ?? undefined,
          make: i.make ?? undefined,
          model: i.model ?? undefined,
          trim: i.trim ?? undefined,
          lookedUpAt: i.lookedUpAt,
          tier: i.tier,
          reportId: i.reportId ?? undefined,
        })),
      providesTags: ['History'],
    }),

    // The owner's paid reports — server-backed Restore Purchases.
    getPurchases: builder.query<PurchaseFeedItem[], void>({
      query: () => '/purchases',
      providesTags: ['Purchases'],
    }),
  }),
});

export const {
  useLookupVinMutation,
  useLookupPlateMutation,
  useRefreshPlateMutation,
  useStartPlatePurchaseMutation,
  useConfirmPlatePurchaseMutation,
  useGetVehicleBasicQuery,
  useStartPurchaseMutation,
  useConfirmPurchaseMutation,
  useGetReportQuery,
  useRefreshReportMutation,
  useRetryReportMutation,
  useSocialSignInMutation,
  useRegisterEmailMutation,
  useLoginEmailMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useLogoutMutation,
  useDeleteAccountMutation,
  useSyncHistoryMutation,
  useGetHistoryQuery,
  useGetPurchasesQuery,
  useLazyGetPurchasesQuery,
} = api;
