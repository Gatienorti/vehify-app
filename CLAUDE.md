# CLAUDE.md — Vehify Mobile

> Scan-first used-car checker. Scan a plate or VIN → instant free basic summary → paid Buyer's Analysis → full history report.
> Full product spec: `~/Downloads/vehicle_lookup_app_claude_code_full_spec.md` (source of truth for product decisions).
> **Pricing/report tiers: `~/Downloads/Vehify_Report_Tiers_and_API_Cost_MVP_v2.pdf` is the source of truth** — it supersedes the spec's older single-$4.99 model. Prices live in code at `src/config/pricing.ts`.

## Status

**Scaffolded (Phase 1–3 + mock purchases).** Expo SDK 57 · RN 0.86 · React 19 · TypeScript strict.
**All data — mock or real — comes from the Laravel backend** (`../vehify-web`, its mock provider
layer); the in-app mock layer was removed. Point `EXPO_PUBLIC_API_BASE_URL` at the running backend.
Still to build: real RevenueCat purchases, real providers in the backend, account sign-in.
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

**Stack (installed):** Expo SDK 57 · RN 0.86 · React 19 · TypeScript strict · Redux Toolkit + RTK Query · React Navigation 7 (native-stack + bottom-tabs) · expo-linear-gradient · AsyncStorage (local history) · expo-camera + react-native-mlkit-ocr + expo-image-manipulator (on-device plate scanning) · Jest + RN Testing Library.

**Planned (later phases):** RevenueCat (one-time non-consumable report purchases).

> Camera OCR (ML Kit) needs native modules → **Expo dev client / config plugins**, not Expo Go.

**Brand:** blue "V" check, tagline "Verify before you buy". Palette in `src/theme/colors.ts` — `brand.blue` (#1E63EB), `brandGradient` for the SCAN button / hero CTAs, `brand.navy` for ink. Bundle id `com.vehify.app`. **TODO:** replace the placeholder `assets/` icon + splash with the real logo (light mark on `#1E63EB`).

## Product Model (what this app is)

3 bottom-nav items, SCAN is the prominent center action:

```
History        [ SCAN ]        Account
```

- **History** — recent lookups, saved vehicles, purchased reports, `BASIC`/`ANALYSIS`/`FULL HISTORY` badges. Purchased reports live here — **no separate Reports tab**.
- **SCAN** — center, larger, camera icon. Opens the live scanner. The main action.
- **Account** — optional Apple/Google sign-in, restore purchases, settings, support, legal.

**Business model (Report Tiers v2 — progressively more valuable reports):**

| Tier | Question answered | Customer price | Notes |
|------|-------------------|----------------|-------|
| Free VIN lookup | Is this the correct vehicle? | **FREE** | NHTSA decode + recalls |
| Plate lookup | Which vehicle is this? | **$0.25** | Plate→VIN; **credited toward Buyer's Analysis** |
| Buyer's Analysis | Should I buy this vehicle? | **$2.99** (**$2.74** after plate credit) | AI Buy Score, market value, MSRP, suggested offer, negotiation, recalls |
| Complete Vehicle History | What happened to this VIN? | **+$5 upgrade → $7.99** | Everything above **+** accident/title/theft/odometer/owners/auction/service |

Complete History is an **upgrade-only** path — the user buys Buyer's Analysis first, then adds full history for +$5. Optimize for a one-time consumer, not a dealer power user. No credits, no subscription at launch. `ReportTier = 'basic' | 'buyers_analysis' | 'complete_history'`.

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

### On-device scanning (Phase 4, built) — `src/ml/`
Google **ML Kit text recognition** (`react-native-mlkit-ocr`) runs **on-device** (never server-side — that's the scan promise). A prior self-trained ONNX pipeline was removed — it produced garbage reads; don't reintroduce it. Pipeline (`readPlateOnce` in `plateProcessor.ts`, one call per 500ms loop tick):
1. `expo-camera` photo (1080p `pictureSize`, fast) → **normalize-first**: resize to 900w in the SAME `manipulateAsync` call as the crop. Normalizing bakes the EXIF rotation into pixels — cropping the raw photo crops the unrotated sensor buffer and lands in the wrong place (hard-won bug). Crop = the on-screen `ScannerFrame` region mapped via `frameCrop.ts` (cover-mode math, `Math.min` scale).
2. One locate OCR pass. `findVinInBlocks` (`vinDetect.ts`) first — a 17-char VIN wins immediately (free route). VIN candidates are **per-line only** (never stitch lines: "TEXAS"+"BC5X489"+"TEXAS" = 17 chars) and must pass the **ISO 3779 check digit** (`hasValidCheckDigit` in `utils/vin.ts`). Else `findPlateInBlocks` locates the most plate-like token + bounding region (`plateScore.ts`).
3. **6 tight re-crops** (varied padding, upscaled to 300px) around the region → per-character **consensus voting** (`vote.ts`, digit-twin rule: 2/Z, 5/S, 8/B, 6/G → digit wins; I/O/Q→1/0/0 since US plates never issue them). Confirm sheet opens after **2 consecutive confident ticks** agree.
4. **4 wide vertical re-crops** (upscaled to 500px, concurrent with step 3, skipped once a state has 2 votes) → state detection (`stateDetect.ts`): exact name → fuzzy (Levenshtein ≤2) → unambiguous 2-letter code → slogans (`STATE_SLOGANS`, "EMPIRE STATE" → NY). Most-voted wins; null → user picks in the confirm sheet.

`stateDetect.ts` / `plateScore.ts` / `vote.ts` / `vinDetect.ts` / `frameCrop.ts` are pure and unit-tested (`src/ml/__tests__/`).

**One unified scan (no plate/VIN mode toggle).** `ScanScreen` runs all detectors at once; priority **barcode → VIN text → plate**:
- **Barcode/QR → VIN (free).** Plates are never barcoded, so any barcode is a VIN. `barcodeScannerSettings` watches QR (Tesla door jamb), DataMatrix, PDF417, Code39/128 on the live preview — no photo needed. `extractVinFromBarcode` digs the VIN out of any payload shape. Opens editable **`VinConfirmSheet`**.
- **VIN text → VIN (free).** Door-jamb printed VIN via the locate pass (step 2 above).
- **Plate loop → Plate ($0.25).** Opens **`ScanConfirmSheet`** — editable plate + state picker + explicit `Search plate · $0.25` confirm. Manual plate entry (`ManualEntrySheet`) routes through the same sheet.
- Camera UX: preview live on tab arrival (scan loop only after "Start scanning"), pinch-to-zoom (gesture wraps the whole screen — wrapping only `CameraView` gets buried under the UI), torch toggle, `autofocus="off"` (expo-camera semantics are inverted: "on" = focus-once-then-LOCK, "off" = continuous — a scanner needs continuous).
- Requires an **Expo dev client** (`npx expo run:ios --device`, not Expo Go); iOS simulators have no camera. ML Kit reads garbage off monitors/screens (moiré) — test against real plates or paper printouts.

### Lookup → Confirm → Basic → Upsell (spec §8, §10–12)
1. **VIN lookup** (free): decode via NHTSA vPIC + recalls → basic summary.
2. **Plate lookup**: cache-first; always show a **"Is this the correct vehicle?"** confirmation. From cache, "No, refresh" can be free; from live API, steer to "Enter VIN instead" (don't allow unlimited free refreshes).
3. **Basic result** (free): YMM, trim, specs, open recalls, basic summary.
4. **Buyer's Analysis upsell**: `Get Buyer's Analysis — $2.99` (or `$2.74` with plate credit). IAP → report with **AI Buy Score** (score + reason, never a bare number; green 80+, yellow 60–79, red <60), market value, MSRP, suggested offer, recommendation.
5. **Complete History upgrade**: from the Buyer's Analysis report, `Add Complete History — +$5` → same report screen now also shows accident/title/theft/odometer/owners. One shared `PremiumUpsell` screen + one shared `PremiumReport` screen, both parameterized by `tier`.

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

- One-time **non-consumable** report products via RevenueCat (ids in `src/config/pricing.ts`): `buyers_analysis` ($2.99) and `complete_history_upgrade` (+$5). Complete History is an upgrade purchased *after* Buyer's Analysis.
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
