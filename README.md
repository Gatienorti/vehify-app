# Vehify Mobile

Scan-first used-car checker — scan a plate or VIN, get an instant free basic summary,
unlock a paid full history report. iOS + Android, built with Expo + TypeScript.

> Product spec: `~/Downloads/vehicle_lookup_app_claude_code_full_spec.md`
> Conventions & architecture: [`CLAUDE.md`](./CLAUDE.md)
> Backend (Laravel): `../vehify-web`

## Getting started

```bash
npm install
cp .env.example .env      # point EXPO_PUBLIC_API_BASE_URL at the backend
npm start                 # then press i (iOS) or a (Android)
```

All data comes from the Laravel backend (`../vehify-web`) — start it with
`php artisan serve --host=0.0.0.0`. Its provider layer serves mock data until
real vehicle-data providers are wired, so every flow (VIN lookup, plate lookup,
basic result, Buyer's Analysis, Complete History) works end-to-end today. There
is no in-app mock mode.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Start the Expo dev server |
| `npm run ios` / `npm run android` | Open on a simulator/device |
| `npm test` | Jest + React Native Testing Library |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run format` | Prettier |

## Status

**iOS 1.0 is live on the App Store** (July 2026): https://apps.apple.com/us/app/vehify/id6791685358
Android is in testing ahead of a Play Store launch.

Everything is built: 3-tab navigation with the center **SCAN** button, live camera
scanner (on-device ML Kit OCR for plates + VIN barcodes — see `src/ml/` and
CLAUDE.md → *On-device scanning*), manual VIN/plate entry, cache-aware plate →
confirmation → free basic result → tiered upsell, report tiers v2
(`src/config/pricing.ts`: free basic → $1.99 Buyer's Analysis → +$2.99 Complete
History upgrade), RevenueCat purchases, Apple/Google/email sign-in, and local
login-free history (AsyncStorage).

> The camera scanner needs an **Expo dev client** (`npx expo run:ios --device` /
> `npx expo run:android --device`) — not Expo Go — and a real device; simulators
> have no camera, and ML Kit misreads plates shown on monitors (moiré).

## Android

```bash
npx expo run:android --device   # dev client on a USB-connected phone
```

- Native project is checked in (`android/`); `adb` lives at `~/Library/Android/sdk/platform-tools`.
- Release AAB: `cd android && ./gradlew bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`.
  Signing uses the upload keystore at `~/keystores/vehify-upload.jks` via `VEHIFY_UPLOAD_*`
  properties in the (gitignored) `android/gradle.properties`. Release bundles bake
  `.env.production` (prod API URL), same as iOS archives.
- Bump `android.versionCode` in `app.json` **and** `versionCode` in
  `android/app/build.gradle` for every Play upload.

See `CLAUDE.md` → *Available Agents & Commands* for the scaffolding helpers
(`screen-builder`, `test-writer`, `provider-builder`, `analytics-auditor`).
