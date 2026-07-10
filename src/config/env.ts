/**
 * Environment config. The mobile app talks ONLY to the Laravel backend
 * (../vehify-web) — never to a vehicle-data provider directly.
 *
 * While the backend is still being built, USE_MOCKS keeps every flow working
 * against in-app mock data. Flip it off (or set EXPO_PUBLIC_USE_MOCKS=false)
 * once the backend endpoints are live.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export const USE_MOCKS =
  (process.env.EXPO_PUBLIC_USE_MOCKS ?? 'true').toLowerCase() !== 'false';
