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

## What's built (Phase 1–3 + mock purchases)

- 3-tab navigation with a prominent center **SCAN** button (History / SCAN / Account).
- Manual VIN + plate entry with validation (17-char VIN, state-required plate).
- Cache-aware plate → **confirmation** → free **basic result** → tiered **upsell** flow.
- Report tiers v2 (`src/config/pricing.ts`): free VIN → plate $0.25 (credited) →
  **Buyer's Analysis** $2.99 (**AI Buy Score**, market value, suggested offer) →
  **Complete Vehicle History** +$5 upgrade (accidents, title, theft, odometer, owners).
- Local, login-free history persisted on-device (AsyncStorage).
- RTK Query API layer with a mock/real switch; analytics event wrapper.

## Not yet built (later phases)

- **Phase 4 — camera scanner**: live OCR needs `react-native-vision-camera` + ML Kit
  and an Expo **dev client** (not Expo Go). The Scan screen currently shows a placeholder.
- **Real purchases**: RevenueCat non-consumable report products.
- **Real backend**: swap mocks off once `../vehify-web` endpoints are live.
- **Account sign-in**: Apple/Google + history sync.

See `CLAUDE.md` → *Available Agents & Commands* for the scaffolding helpers
(`screen-builder`, `test-writer`, `provider-builder`, `analytics-auditor`).
