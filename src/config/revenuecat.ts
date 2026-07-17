import Purchases, { LOG_LEVEL } from 'react-native-purchases';

/**
 * RevenueCat configuration. The public SDK key is NOT a secret (it ships in
 * every binary).
 *
 * Current key: the project's TEST STORE — real SDK flow, simulated store, no
 * App Store Connect products or Paid Apps agreement needed. Purchases made
 * against it are fake and free. Swap in the real per-platform keys
 * (appl_… / goog_…) once the store app configs exist in RevenueCat.
 */
export const REVENUECAT_API_KEY = 'test_FmcXGJopMOSbVaDZSqgTozHYSYl';

/**
 * Initialize the SDK once at app boot. `appUserID` = our anonymous device id,
 * so RevenueCat's customer identity lines up with the backend's device-keyed
 * ownership (and with the account once /history/sync claims the device).
 */
export function initRevenueCat(deviceId: string): void {
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: deviceId });
}
