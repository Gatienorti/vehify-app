import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

/**
 * RevenueCat configuration. Public SDK keys are NOT secrets (they ship in
 * every binary). Which key runs decides which store the SDK talks to:
 *
 *  - appl_… (iOS)     — the REAL App Store pipeline: sandbox purchases in
 *    TestFlight/dev against the "Ready to Submit" IAPs (needs the ASC
 *    In-App Purchase key uploaded to the RevenueCat iOS app), real charges
 *    once the app + IAPs are approved. Requires the Paid Apps agreement to
 *    be Active.
 *  - goog_… (Android) — same idea via Play (fill in when the Play Console
 *    app + service credentials exist).
 *  - test_…           — RevenueCat's TEST STORE: simulated store, free fake
 *    purchases, zero Apple/Google setup.
 *
 * Dev builds get the Test Store automatically; release builds get the real
 * store. The SDK enforces this split itself — a test_ key in a TestFlight/
 * production build shows "Wrong API Key" and force-quits the app.
 */
const USE_TEST_STORE = __DEV__;

const TEST_STORE_KEY = 'test_FmcXGJopMOSbVaDZSqgTozHYSYl';

const STORE_KEYS = {
  ios: 'appl_QrKHDldTxhBHLifcHwOvEQvSdeK',
  android: 'goog_zdkreteTqpZQvKhXyaXQoGbARbi',
} as const;

export const REVENUECAT_API_KEY = USE_TEST_STORE
  ? TEST_STORE_KEY
  : Platform.OS === 'android'
    ? STORE_KEYS.android
    : STORE_KEYS.ios;

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
