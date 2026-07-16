/**
 * Social sign-in configuration. Client IDs are public identifiers (they ship
 * inside every app binary) — NOT secrets.
 *
 * GOOGLE_WEB_CLIENT_ID: the "Web application" OAuth client from Google Cloud
 * Console → Auth Platform → Clients. This is the token AUDIENCE the backend
 * verifies against (services.google.client_id must be the SAME value).
 * Leave empty until created — the Google button falls back to "coming soon".
 *
 * Apple needs no config here: the identity token's audience is the bundle id,
 * and the entitlement comes from app.json (usesAppleSignIn).
 */
export const GOOGLE_WEB_CLIENT_ID =
  '297086662226-epl972hk7mctfbk2piapn8qg8fj3oo8l.apps.googleusercontent.com';

/** The iOS OAuth client (Google Cloud → Clients → "Vehify ios"). */
export const GOOGLE_IOS_CLIENT_ID =
  '297086662226-iuo0m8t2fmplorc8n8hg7lj7ac6a4lag.apps.googleusercontent.com';

/** True once the Google client is configured (gates the real button). */
export const GOOGLE_SIGN_IN_READY = GOOGLE_WEB_CLIENT_ID.length > 0;
