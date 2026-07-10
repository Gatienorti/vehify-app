import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, USE_MOCKS } from '../config/env';
import type {
  BasicVehicleResponse,
  PlateLookupRequest,
  PlateLookupResponse,
  PlateRefreshRequest,
  PurchaseConfirmRequest,
  PurchaseConfirmResponse,
  PurchaseStartRequest,
  PurchaseStartResponse,
  ReportResponse,
  VinLookupRequest,
  VinLookupResponse,
} from '../types/api';
import {
  mockBasic,
  mockPlateLookup,
  mockReport,
  mockVinLookup,
} from './mockData';

type Query = BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError>;

const rawBaseQuery: Query = fetchBaseQuery({ baseUrl: `${API_BASE_URL}/api` });

/**
 * The ONLY place the app talks to the Laravel backend. While USE_MOCKS is on,
 * endpoints resolve from the in-app mock provider so every flow works before
 * the backend exists. Screens always consume these RTK Query hooks — never
 * raw fetch, and never a vehicle-data provider directly (spec §19).
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: rawBaseQuery,
  tagTypes: ['VehicleBasic', 'Report'],
  endpoints: (builder) => ({
    lookupVin: builder.mutation<VinLookupResponse, VinLookupRequest>({
      queryFn: async (arg, apiCtx, extra) => {
        if (USE_MOCKS) return { data: mockVinLookup(arg.vin) };
        const res = await rawBaseQuery(
          { url: '/lookup/vin', method: 'POST', body: arg },
          apiCtx,
          extra,
        );
        return res as { data: VinLookupResponse };
      },
    }),

    lookupPlate: builder.mutation<PlateLookupResponse, PlateLookupRequest>({
      queryFn: async (arg, apiCtx, extra) => {
        if (USE_MOCKS) return { data: mockPlateLookup(arg.plate, arg.state) };
        const res = await rawBaseQuery(
          { url: '/lookup/plate', method: 'POST', body: arg },
          apiCtx,
          extra,
        );
        return res as { data: PlateLookupResponse };
      },
    }),

    refreshPlate: builder.mutation<PlateLookupResponse, PlateRefreshRequest>({
      queryFn: async (arg, apiCtx, extra) => {
        if (USE_MOCKS) return { data: mockPlateLookup(arg.plate, arg.state) };
        const res = await rawBaseQuery(
          { url: '/lookup/plate/refresh', method: 'POST', body: arg },
          apiCtx,
          extra,
        );
        return res as { data: PlateLookupResponse };
      },
    }),

    getVehicleBasic: builder.query<BasicVehicleResponse, string>({
      queryFn: async (vin, apiCtx, extra) => {
        if (USE_MOCKS) return { data: mockBasic(vin) };
        const res = await rawBaseQuery(`/vehicle/${vin}/basic`, apiCtx, extra);
        return res as { data: BasicVehicleResponse };
      },
      providesTags: (_r, _e, vin) => [{ type: 'VehicleBasic', id: vin }],
    }),

    startPurchase: builder.mutation<PurchaseStartResponse, PurchaseStartRequest>({
      queryFn: async (arg, apiCtx, extra) => {
        if (USE_MOCKS) return { data: { purchaseToken: `mock-token-${arg.vin}` } };
        const res = await rawBaseQuery(
          { url: '/report/purchase/start', method: 'POST', body: arg },
          apiCtx,
          extra,
        );
        return res as { data: PurchaseStartResponse };
      },
    }),

    confirmPurchase: builder.mutation<PurchaseConfirmResponse, PurchaseConfirmRequest>({
      queryFn: async (arg, apiCtx, extra) => {
        if (USE_MOCKS) return { data: { reportId: `mock-report-${arg.purchaseToken}` } };
        const res = await rawBaseQuery(
          { url: '/report/purchase/confirm', method: 'POST', body: arg },
          apiCtx,
          extra,
        );
        return res as { data: PurchaseConfirmResponse };
      },
      invalidatesTags: ['Report'],
    }),

    getReport: builder.query<ReportResponse, { id: string; vin: string }>({
      queryFn: async (arg, apiCtx, extra) => {
        if (USE_MOCKS) return { data: mockReport(arg.vin, arg.id) };
        const res = await rawBaseQuery(`/report/${arg.id}`, apiCtx, extra);
        return res as { data: ReportResponse };
      },
      providesTags: (_r, _e, arg) => [{ type: 'Report', id: arg.id }],
    }),
  }),
});

export const {
  useLookupVinMutation,
  useLookupPlateMutation,
  useRefreshPlateMutation,
  useGetVehicleBasicQuery,
  useStartPurchaseMutation,
  useConfirmPurchaseMutation,
  useGetReportQuery,
} = api;
