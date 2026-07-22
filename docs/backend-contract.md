# Vehify Mobile ↔ Backend Contract (Report Tiers v3)

> The single explainer for how the app talks to the backend (`../vehify-web`, live at `https://vehify.app`).
> Types in `src/types/api.ts` + `src/types/vehicle.ts` mirror these shapes exactly. All responses are
> **flat JSON — no `data` wrapper**. Base path: `https://vehify.app/api`.

## The product in one picture

```
scan plate ──► FREE plate→VIN (quota on live resolves) ──► identity
   or                                        │
type VIN  ──► FREE identity lookup ──────────┤         (always unlimited)
                                             ▼
                              $1.99 BUYER REPORT
                              "should I buy this MODEL, and
                               is the price fair?"
                                             │
                                             ▼
                              +$3.00 PREMIUM REPORT
                              "what happened to THIS car?"
                              (upgrade-only — needs an owned analysis)
```

**All charging happens in-app via RevenueCat.** The backend records prices for bookkeeping and
computes upgrade eligibility; the store products are:

| RevenueCat product id | Price | What |
|---|---|---|
| `buyers_analysis` | $1.99 | Buyer Report |
| `complete_history_upgrade` | $3.00 | Premium Report upgrade |

**Plate→VIN is free.** Cache hits are unlimited; only LIVE cache-miss resolves count against a
personal quota: anonymous device **5/hour + 15/day**, signed-in **15/hour + 30/day** (account-wide).
Confirming any paid report **resets** the buyer's counters. Over quota → **429** — the app shows the
sign-in upsell (anonymous) or the "frees up within the hour" note (signed-in); VIN entry is always
the unlimited escape hatch.

## The honesty rule (why there are two scores)

The $1.99 Buyer Report has **never seen this VIN's records**, so it never fakes a per-VIN verdict:

- **`modelScore`** (always present on paid reports) — judges the **MODEL**: NHTSA owner complaints,
  open recalls, manufacturer service bulletins (TSBs), **federal defect investigations** (an OPEN
  one is the heavy red flag), crash ratings. All real bulk-imported NHTSA data.
- **`deal`** — judges the **PRICE**: buyer-entered `askingPrice` vs market value at buyer-entered
  `mileage` → `good | fair | high` + dollar delta. `verdict` is null if no asking price was entered.
- **`buyScore`** — judges **THIS CAR**: computed only on real CARFAX/Autocheck records, so it is
  **null on `buyers_analysis`** and populated on `complete_history`. Show the null as the upsell:
  *"Model checks out ✅ — verify this exact car (+$3)."*

## Identity: X-Device-Id

Send a stable per-install UUID as the `X-Device-Id` header on **every** request. It's how anonymous
buyers own their purchases/history; after sign-in (`Authorization: Bearer <sanctum token>`),
`POST /history/sync` claims device records into the account. Report fetches are ownership-gated
(matching device id or account) — anything else 404s.

## Endpoints

### Free (tier 1)
| Endpoint | Notes |
|---|---|
| `POST /lookup/vin` `{vin}` | → `BasicReport` = `{vehicle, summary, estimatedValue: null}`. **Identity only** — no recalls/safety/fuel here (paid-tier data). |
| `GET /vehicle/{vin}/basic` | Same slim shape from cache. |
| `POST /lookup/plate` `{plate, state}` | FREE cache-first plate→VIN → `{source, lastVerifiedAt, isLiveVerified, vehicle}`. Cache hits unlimited; a cache miss live-resolves against the personal quota. **429** = quota spent (show sign-in upsell / VIN steer). 404 = genuine no-hit → steer to VIN entry. |
| `POST /lookup/plate/refresh` `{plate, state, reason}` | Live re-resolve for a rejected match — only when the mapping is 30+ days old (else serves cache); draws from the same quota (429 possible). |

### Report purchase
| Endpoint | Notes |
|---|---|
| `POST /report/purchase/start` `{vin, tier, productId, mileage?, askingPrice?}` | → `{purchaseToken}` (201). `tier`: `buyers_analysis` (default) or `complete_history`. **Ask the buyer for `mileage` (odometer) and `askingPrice` — they're standing at the car**; these personalize the valuation, power the deal verdict, the value-vs-mileage curve, and the rollback cross-check. `complete_history` without an owned paid analysis for that VIN → **422** (it's upgrade-only). |
| `POST /report/purchase/confirm` `{purchaseToken, tier, platform, appStoreTransactionId}` | Verifies the purchase **with RevenueCat** (server-side, fail-closed) — an unverifiable transaction → **402** and nothing is granted (retry after a moment; the purchase isn't lost). On success: marks paid and **queues** the content build → `{reportId, tier, status}` instantly (`status`: `generating`\|`ready`\|`failed`). Poll `GET /report/{id}` until `ready`. Safe to re-fire (idempotent, never re-charges). |
| `GET /report/{id}` | While the queued build runs → `{id, reportId, tier, vin, status: 'generating'\|'failed'}` (poll at ~2.5s). Once built → full `ReportResponse` (below) with `status: 'ready'`. Ownership-gated. |
| `POST /report/{id}/retry` | **FREE** recovery when `status: 'failed'` — re-queues the already-paid build → `{reportId, id, tier, vin, status: 'generating'}`. 422 when there's nothing to retry (content exists / never paid). |
| `POST /report/{id}/refresh` `{transactionId}` | Regenerate with current data (stale-report banner), paid via the `report_refresh` consumable — send the store transaction id; it's verified with RevenueCat and consumed exactly once (replay → **422**, unverifiable → **402**). Clears the content and re-queues → the same generating payload; poll like after a purchase. |

### Account
| Endpoint | Notes |
|---|---|
| `POST /auth/social` `{provider, identityToken, name?}` | Sign in with Apple/Google → `{token, user}` (401 on a bad token). Matching: provider id → verified email (links) → new account. Send `name` when Apple provides it (first authorization only). **Local dev:** the backend runs `SOCIAL_AUTH_DRIVER=mock` — the "identityToken" is literally `{"sub":"apple-001","email":"x@y.com","name":"X"}` as a JSON string, so the full flow works with no Apple/Google setup. |
| `POST /auth/logout` (Sanctum) | Revokes the current token (other devices stay signed in). |
| `POST /history/sync` `{deviceId?, items}` (Sanctum) | Claims device history + purchases into the account. Call right after sign-in with the device id. |

## ReportResponse shape (`Report & {id}`)

```jsonc
{
  "id": "42",
  "tier": "buyers_analysis",            // or "complete_history"
  "vehicle": { "vin": "...", "year": 2019, "make": "TOYOTA", "model": "Camry", ... },
  "analysis": {
    "modelScore": { "score": 82, "band": "green", "reason": "No open recalls..." },
    "deal": { "verdict": "high", "priceDelta": 1400, "reason": "The asking price is $1,400 (8%) over market value — negotiate down." },
    "askingPrice": 18500,
    "buyScore": null,                    // per-VIN — null until complete_history
    "investigations": { "total": 1, "open": 1, "items": [ { "actionNumber": "PE25010", "subject": "...", "isOpen": true, ... } ] },
    "recommendation": "...",
    "negotiationAdvice": "Open at $16,200 — just under the market band (fair value at 78,200 miles ≈ $17,800)...",
    "maintenanceOutlook": "...",
    "estimatedValue": 17800, "valueLow": 16376, "valueHigh": 19224,
    "msrp": null, "depreciationPct": null,  // ALWAYS null — no real MSRP source (CarAPI = single point value); never fabricated
    "suggestedOffer": 16020,
    "buyerMileage": 78200,
    "valueByMileage": [ { "mileage": 48200, "estimate": 19900 }, ... ],  // centered on the entry
    "mileageHistory": [ { "date": "2023-06", "mileage": 31200, "source": "Title" } ],  // complete_history ONLY — odometer readings are history-class data; [] on buyers_analysis
    "rollbackDetected": false,             // only ever true on complete_history (needs real readings)
    "openRecalls": [ { "id": "23V123", "summary": "...", "component": "..." } ],
    "complaintTrends": "47 owner complaints on file with NHTSA for this model — most often about air bags.",
    "manufacturerCommunications": 12,    // TSB count (details additive)
    "factoryEquipment": ["Heated front seats", ...],
    "photoUrls": [],
    "safety": { "overall": 5, ... }, "fuelEconomy": { "combined_mpg": 32, ... }
  },
  "history": null                        // populated ONLY on complete_history:
  // { "accidents": 2, "titleBrands": ["Salvage"], "thefts": 0, "odometerIssues": 1,
  //   "owners": 3, "auctionRecords": [...], "serviceHistory": [...] }
}
```

## UI flow cheatsheet

1. **Scan/enter** → free identity → "Is this the correct vehicle?" screen.
2. **Before purchase**, collect two optional inputs (huge value, zero friction — the buyer is at
   the car): *odometer reading* and *asking price*.
3. **Analysis screen** leads with `modelScore` + `deal`; the locked per-VIN section shows
   `buyScore: null` as the +$5 unlock.
4. **History screen** (tier 4): counts up top (`accidents`, `titleBrands`, `owners`,
   `odometerIssues`), record lists below, real per-VIN `buyScore` replaces the lock.

## Gotchas

- `tier` + `productId` are **required** on report start/confirm; invalid values → 422.
- Quota 429s only ever fire on LIVE plate resolves — a repeated scan of any already-seen plate
  (hit or remembered no-hit) always answers, even at zero quota.
- `estimatedValue` on the free `BasicReport` is a transitional always-null key — ignore it.
- Report ids are sequential but unguessable in practice: fetching without the right
  `X-Device-Id`/token 404s (never 403) so existence can't be probed.
- Backend repo docs: `../vehify-web/docs/report-tiers-v2.md` (product),
  `../vehify-web/docs/external-providers.md` (data sources), `/docs` on the server (Scribe,
  admin-only) with OpenAPI + Postman exports.
