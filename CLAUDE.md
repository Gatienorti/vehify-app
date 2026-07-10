# CLAUDE.md — Vehify Mobile

> Scan-first used-car checker. Scan a plate or VIN → instant free basic summary → paid full history report.
> Full product spec: `~/Downloads/vehicle_lookup_app_claude_code_full_spec.md` (source of truth for product decisions).

## Status

**Scaffolded (Phase 1–3 + mock premium).** Expo SDK 57 · RN 0.86 · React 19 · TypeScript strict.
Every flow works end-to-end against in-app mocks (`EXPO_PUBLIC_USE_MOCKS=true`). Still to build:
camera OCR (Phase 4, needs a dev client), real RevenueCat purchases, real backend, account sign-in.
See `README.md` for the built/not-built breakdown.

- **Mobile app** (this repo): `/Users/gatien/Desktop/vehify/vehify-mobile` — TypeScript React Native (Expo), iOS + Android.
- **Backend**: `../vehify-web` (`cd ../vehify-web`) — **Laravel (PHP)**. All provider/API calls live here. The app **never** calls a vehicle-data provider directly.

## Critical Rules

- **App → backend → provider abstraction → external API.** The mobile app talks only to `../vehify-web`. Never put a provider API key or provider URL in the app.
- **Never call the backend on live camera frames.** OCR runs on-device continuously; a network lookup fires **only after the user taps "Search"** (see [Scan Flow](#scan-flow)). Accidental API calls cost real money.
- **Cache-first for plate lookups.** Plate→VIN is the expensive call. Always check backend cache before a live provider call. The cache is a core business advantage (see spec §9).
- **TypeScript strict from day one.** No `any`. Shared types in `src/types/`. This is a fresh TS project, not an incremental migration.
- **RTK Query for all API calls** via `src/services/api.ts` — never raw `fetch` in screens.
- **Deliver value before asking for anything.** No login wall, no account, no permission request before the first lookup. Camera permission is requested only when SCAN is tapped.
- **Don't promise data a provider can't deliver.** Use the calm/hedged copy from the spec (§9, §12). Avoid "Danger" unless a serious issue is actually confirmed.
- **Never expose owner identity.** This app is vehicle identity + history, not owner lookup (DPPA — spec §21).
- Use **plan mode** for any task with 3+ steps.

## Quick Reference

| Category | Command |
|----------|---------|
| Dev | `npm start` |
| iOS / Android | `npm run ios` / `npm run android` |
| Test | `npm test` / `npm run test:watch` |
| Lint / Format | `npm run lint:fix` / `npm run format` |
| TS Check | `npx tsc --noEmit` |
| Build | `eas build --platform [ios\|android]` |
| Backend | `cd ../vehify-web` |

**Stack (installed):** Expo SDK 57 · RN 0.86 · React 19 · TypeScript strict · Redux Toolkit + RTK Query · React Navigation 7 (native-stack + bottom-tabs) · expo-linear-gradient · AsyncStorage (local history) · Jest + RN Testing Library.

**Planned (later phases):** react-native-vision-camera + ML Kit text recognition (on-device OCR) · RevenueCat (one-time non-consumable report purchases).

> Camera OCR (ML Kit) needs native modules → **Expo dev client / config plugins**, not Expo Go.

**Brand:** blue "V" check, tagline "Verify before you buy". Palette in `src/theme/colors.ts` — `brand.blue` (#1E63EB), `brandGradient` for the SCAN button / hero CTAs, `brand.navy` for ink. Bundle id `com.vehify.app`. **TODO:** replace the placeholder `assets/` icon + splash with the real logo (light mark on `#1E63EB`).

## Product Model (what this app is)

3 bottom-nav items, SCAN is the prominent center action:

```
History        [ SCAN ]        Account
```

- **History** — recent lookups, saved vehicles, purchased reports, `BASIC`/`PREMIUM` badges. Purchased reports live here — **no separate Reports tab**.
- **SCAN** — center, larger, camera icon. Opens the live scanner. The main action.
- **Account** — optional Apple/Google sign-in, restore purchases, settings, support, legal.

**Business model:** free basic lookup builds trust; the **paid full history report ($4.99 target) is the revenue product.** Optimize for a one-time consumer, not a dealer power user. No credits, no subscription at launch.

## Core Flows

### Scan Flow (spec §6)
1. Tap SCAN → request camera permission (first time only) → live camera.
2. On-device auto-detect (barcode=VIN, plate-text=plate — see *Scan auto-detect* below), **no network calls**.
3. Detection stable ~0.5–1s → freeze frame, show detected text.
4. User taps **Search** → *now* call backend. Offer **Edit** if the read is wrong.
5. `Can't scan? Type instead` → manual-entry bottom sheet (VIN or Plate).

### Manual Entry (spec §7)
- **VIN**: 17 chars, exclude `I/O/Q`, clear inline error on invalid.
- **Plate**: plate number + **state dropdown (required)** for plate→VIN.

### On-device plate scanning (Phase 4) — `src/ml/`
Two self-trained ONNX models run **on-device** (never server-side — that's the scan promise), bundled in `assets/models/`:
- **`plate_ocr.onnx`** — CRNN+CTC. Input RGB `[1,3,48,320]` → `[80,1,37]` logits → `ctcGreedyDecode` (37 classes = blank + 36).
- **`plate_state.onnx`** — MobileNetV3. Input grayscale `[1,1,48,192]` → `[1,52]` softmax → `decodeState` (52 classes). Auto-detects the plate's state, so **scanned** plates skip the state dropdown.

`src/ml/`: `ctc.ts` / `state.ts` (pure decoders, unit-tested), `config.ts` (shapes + charset/labels/normalization), `types.ts` (`PlateReader`), `MockPlateReader.ts` (for UI before native wiring), `modelAssets.ts` (bundled `require`s).

- ⚠️ **`config.ts` charset order, 52 state labels, and normalization are UNCONFIRMED placeholders** — replace with the training-repo values (`class_to_idx`, transforms) before trusting decode output.

**Scan auto-detect (no manual "VIN or Plate?" toggle).** The scan screen runs two detectors on the live feed at once and routes by whichever fires first — the user just points at whatever they have:
- **Barcode detected (Code 39) → VIN.** Plates are never barcoded, so a barcode is an unambiguous VIN signal. Decode via vision-camera's built-in **code scanner** — do **not** OCR the VIN text. `plate_ocr` was trained on plates and won't read 17-char VINs reliably.
- **Stable plate-shaped text read → Plate.** Run `plate_ocr` + `plate_state` → plate + auto-detected state (skips the state dropdown).
- **Guard:** if an OCR read is too long / fails plate shape (≈17 chars), nudge "Looks like a VIN — line up the barcode below it, or type it." Validate/repair reads with `validateVin` / plate rules.
- Manual **typing** keeps the VIN/Plate tabs (`ManualEntrySheet`) — the distinction only matters when typing, not when scanning.

**Phase 4b (not built):** install `onnxruntime-react-native` + `react-native-vision-camera` (code scanner + frame processor) + `vision-camera-resize-plugin`; load models via `expo-asset`; overlay `ScannerFrame` on the live preview; throttled read loop with freeze-on-stable; replace the dark placeholder. Requires an **Expo dev client** (not Expo Go); test the camera on a real device (iOS simulators have no camera).

### Lookup → Confirm → Basic → Upsell (spec §8, §10–12)
1. **VIN lookup** (free): decode via NHTSA vPIC + recalls → basic summary.
2. **Plate lookup**: cache-first; always show a **"Is this the correct vehicle?"** confirmation. From cache, "No, refresh" can be free; from live API, steer to "Enter VIN instead" (don't allow unlimited free refreshes).
3. **Basic result** (free): YMM, trim, specs, open recalls, est. value if available, basic summary.
4. **Premium upsell**: `Unlock Complete History — $4.99`. IAP → report screen with **AI Buy Score** (score + reason, never a bare number; green 80+, yellow 60–79, red <60).

### Local History (spec §14)
Store lookups on-device **before** any login (VIN, plate/state, YMM, date, basic snapshot, premium flag + report id). Prompt for an account only *after* value is delivered (2nd launch, after purchase, on "Protect reports") — never block app use.

## Architecture (target)

```
src/
├── components/     # Reusable UI (ScanButton, VehicleCard, ScoreBadge, badges…)
├── screens/        # History, Scan, Account, VehicleMatch, BasicResult, PremiumUpsell, PremiumReport
├── navigation/     # AppNavigator (Bottom Tabs w/ center SCAN + Stack)
├── services/       # api.ts (RTK Query) — the ONLY place that talks to ../vehify-web
├── store/          # Redux slices (history, purchases, auth)
├── features/       # scan (camera/OCR), lookup, report, purchases
├── hooks/          # useVinValidation, useOcrDetection, useLocalHistory…
├── utils/          # vin.ts (validation/normalize), plate.ts (normalize), format
├── theme/          # design tokens
├── types/          # api.ts, navigation.ts, vehicle.ts (shared, no `any`)
└── config/         # revenuecat, analytics, env
```

## Backend Contract (`../vehify-web`)

The app consumes these endpoints (spec §17). Keep request/response types in `src/types/api.ts` in sync with the backend.

| Endpoint | Purpose |
|----------|---------|
| `POST /api/lookup/plate` | Plate→VIN, **cache-first**. Returns `source` (`cache`\|`live`), `lastVerifiedAt`, `isLiveVerified`, `vehicle`. |
| `POST /api/lookup/plate/refresh` | Force live refresh for a rejected/stale cached match. |
| `POST /api/lookup/vin` | Decode VIN → basic info (free). |
| `GET /api/vehicle/:vin/basic` | Cached basic vehicle data. |
| `POST /api/report/purchase/start` · `/confirm` | Begin / confirm IAP → fetch or generate premium report. |
| `GET /api/report/:id` | Fetch a purchased report. |
| `POST /api/history/sync` | Sync local history to account after login. |

**Provider abstraction lives in the Laravel backend** (spec §19): PHP interfaces `PlateToVinProvider`, `VinDecodeProvider`, `RecallProvider`, `MarketValueProvider`, `VehicleHistoryProvider`, `AuctionPhotoProvider`, `AiSummaryProvider` (bound in a service provider, resolved via the container / config). Providers are swappable and start as **mock implementations** — build the whole app against mocks first (spec build phases §22). DB tables per spec §18: `plate_vin_cache`, `vehicle_basic_cache`, `users`, `user_vehicle_history`, `premium_reports`.

## Purchases (spec §16)

- One-time **non-consumable** premium report(s) via RevenueCat: Full Report ($4.99), Full Report Plus ($7.99/$9.99).
- Link a purchased report to the local device first; sync to backend if/when the user creates an account.
- Always support **Restore Purchases**.

## Analytics

Fire the events in spec §23 (`scan_button_tapped`, `plate_cache_hit`/`miss`, `premium_purchase_completed`, …) through one wrapper in `src/config/analytics.ts` — never inline SDK calls in screens. These map directly to the success metrics in §24 (scan-to-search conversion, cache hit rate, report conversion, cost per lookup).

## Workflow

1. **Plan first** — plan mode for anything non-trivial (3+ steps).
2. **Build against mocks** — follow the phased plan (spec §22): skeleton → VIN → plate+cache → camera → history → purchase mock → account → real providers.
3. **Verify** — `npx tsc --noEmit`, run tests, show it works before marking done.
4. **Types are shared** — reuse `src/types/`; keep API types matching `../vehify-web`.
5. **Subagents** — use liberally to keep main context clean (see below).

## Available Agents & Commands

**Agents** (`.claude/agents/`):
- `screen-builder` — Scaffold a screen with route registration, types, theme, and a test.
- `test-writer` — Jest + React Native Testing Library tests following project patterns.
- `provider-builder` — Scaffold a swappable provider (interface + mock + real stub) in `../vehify-web`.
- `analytics-auditor` — Verify every spec §23 event is fired and typed; flag missing/dead events.

**Slash Commands** (`.claude/commands/`):
- `/new-screen <Name>` — Create a screen with route, types, and test.
- `/add-endpoint <spec>` — Add an RTK Query endpoint to `src/services/api.ts`.
- `/add-provider <Name>` — Scaffold a provider abstraction (interface + mock) in the backend.

## Legal / Licensing Guardrails (spec §21)

Before wiring a real provider, confirm caching rights (2-year plate cache), consumer-display rights (VIN/YMM/color), resale rights for reports, PDF storage, no-hit billing, and DPPA compliance. **Do not surface owner identity.** When in doubt, keep the provider mocked and flag the open legal question.
