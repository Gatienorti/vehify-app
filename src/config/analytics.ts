/**
 * Single analytics entry point. Never call an analytics SDK directly from a
 * screen — always go through track(). Event names are the canonical list from
 * the product spec (§23) and are type-checked so typos can't slip through.
 *
 * Do NOT put PII or owner-identity data in props (DPPA — spec §21). Vehicle
 * identifiers and flow state only.
 */
export type AnalyticsEvent =
  | 'app_opened'
  | 'scan_button_tapped'
  | 'camera_permission_requested'
  | 'camera_permission_granted'
  | 'camera_permission_denied'
  | 'plate_detected'
  | 'vin_detected'
  | 'scan_confirmed'
  | 'scan_torch_toggled'
  | 'manual_entry_opened'
  | 'manual_plate_entered'
  | 'manual_vin_entered'
  | 'plate_cache_hit'
  | 'plate_cache_miss'
  | 'plate_lookup_quota_hit'
  | 'mileage_entered'
  | 'asking_price_entered'
  | 'vehicle_match_viewed'
  | 'vehicle_confirmed'
  | 'vehicle_rejected'
  | 'basic_report_viewed'
  | 'premium_cta_viewed'
  | 'premium_purchase_started'
  | 'premium_purchase_completed'
  | 'premium_purchase_failed'
  | 'restore_purchases_tapped'
  | 'purchases_restored'
  | 'account_prompt_viewed'
  | 'account_created'
  | 'account_logged_in'
  | 'account_signed_out'
  | 'account_deleted'
  | 'history_synced'
  | 'history_viewed'
  | 'theme_changed';

type Props = Record<string, string | number | boolean | undefined>;

export function track(event: AnalyticsEvent, props?: Props): void {
  // TODO: wire a real analytics SDK (Amplitude / PostHog / Segment) here.
  if (__DEV__) {
    console.log(`[analytics] ${event}`, props ?? {});
  }
}
