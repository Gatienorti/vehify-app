/**
 * Environment config. The mobile app talks ONLY to the Laravel backend
 * (../vehify-web) — never to a vehicle-data provider directly. The backend is
 * also the only source of mock data (its provider layer); there is no in-app
 * mock mode.
 */
// Release fallback is PROD, not localhost — a store build with a missing env
// file must never ship pointing at a dev machine.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? (__DEV__ ? 'http://localhost:8088' : 'https://vehify.app');
