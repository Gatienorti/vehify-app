import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL } from '../config/env';
import { getDeviceId } from '../config/deviceId';
import type { PaidTier } from '../types/vehicle';
import type { RootState } from '../store';
import type {
  BasicVehicleResponse,
  HistorySyncRequest,
  HistorySyncResponse,
  LogoutResponse,
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
  ReportResponse,
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
  tagTypes: ['VehicleBasic', 'Report'],
  endpoints: (builder) => ({
    lookupVin: builder.mutation<VinLookupResponse, VinLookupRequest>({
      query: (body) => ({ url: '/lookup/vin', method: 'POST', body }),
    }),

    lookupPlate: builder.mutation<PlateLookupResponse, PlateLookupRequest>({
      query: (body) => ({ url: '/lookup/plate', method: 'POST', body }),
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
      invalidatesTags: ['Report'],
    }),

    getReport: builder.query<ReportResponse, { id: string; vin: string; tier: PaidTier }>({
      query: (arg) => `/report/${arg.id}`,
      providesTags: (_r, _e, arg) => [{ type: 'Report', id: arg.id }],
    }),

    // Regenerate a stale report's content (offered via the "X days old"
    // banner). Free while providers are mock/free.
    refreshReport: builder.mutation<ReportResponse, { id: string }>({
      query: (arg) => ({ url: `/report/${arg.id}/refresh`, method: 'POST' }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'Report', id: arg.id }],
    }),

    // --- Account (optional — the app works fully anonymously) ---

    // Sign in with Apple / Google. The native SDK yields an identity token;
    // the backend verifies it and returns a Sanctum bearer token + user.
    socialSignIn: builder.mutation<SocialSignInResponse, SocialSignInRequest>({
      query: (body) => ({ url: '/auth/social', method: 'POST', body }),
    }),

    // Revoke the current device's token server-side (other devices stay in).
    logout: builder.mutation<LogoutResponse, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),

    // Claim anonymous device activity onto the account + copy local history up.
    syncHistory: builder.mutation<HistorySyncResponse, HistorySyncRequest>({
      query: (body) => ({ url: '/history/sync', method: 'POST', body }),
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
  useSocialSignInMutation,
  useLogoutMutation,
  useSyncHistoryMutation,
} = api;
