# mockup.md — Everything the backend (`../vehify-web`) needs

> This is a **spec, not code**. It lists every change the Laravel backend needs so the
> mobile app works end-to-end against it with **mock data served by the backend's
> provider layer** (there is no in-app mock mode anymore).
>
> Source of truth for pricing/tiers: `~/Downloads/Vehify_Report_Tiers_and_API_Cost_MVP_v2.pdf`.
> The mobile contract below mirrors `src/types/api.ts` and `src/types/vehicle.ts` exactly —
> if the backend returns these shapes, the app works with zero app-side changes.

---

## 1. Why this document exists (current drift)

The backend already has the right **routes** but serves the **old single-tier report
shape** (flat `buyScore` / `accidents` / `titleBrands`, `pricePaid: 4.99`). The app was
migrated to the **Report Tiers v2** model and now expects tiered reports. Everything
below closes that gap.

| Area | Backend today | Needed |
|------|---------------|--------|
| Report shape | Flat, single premium report | `{ id, tier, vehicle, analysis, history }` (v2, see §4) |
| Tiers | One $4.99 product | `buyers_analysis` ($2.99 / $2.74) + `complete_history` (+$5 upgrade) |
| Purchase start/confirm | No `tier` concept | Accepts `tier`, enforces **upgrade-only** rule |
| Basic vehicle data | Includes recalls/safety/fuel | **Identity only** (recalls etc. moved to paid tiers) |
| Mock providers | Basic random-ish data | Deterministic, internally **coherent** mock data (§6) |
| Photos | — | Served by backend, re-encoded **WebP** (§7) |

---

## 2. Tier & pricing model (v2)

```
ReportTier = 'basic' | 'buyers_analysis' | 'complete_history'
PaidTier   = 'buyers_analysis' | 'complete_history'
```

| Tier | Question | Price | Notes |
|------|----------|-------|-------|
| Free VIN lookup (`basic`) | Is this the correct vehicle? | FREE | NHTSA decode; identity only |
| Plate lookup | Which vehicle is this? | $0.25 | Plate→VIN; **credited toward Buyer's Analysis** |
| `buyers_analysis` | Should I buy it? | $2.99 (**$2.74** with plate credit) | Buy Score, value, MSRP, offer, negotiation, recalls, TSBs |
| `complete_history` | What happened to this VIN? | **+$5.00 upgrade → $7.99 total** | Analysis **plus** accidents/title/theft/odometer/owners/auction/service |

Rules the backend must enforce:

- **Upgrade-only path**: `complete_history` can only be purchased by a device/user that
  already owns `buyers_analysis` for that VIN. Otherwise → **422** with a clear message.
- **No downgrade / no re-sell**: buying `buyers_analysis` when the device already owns
  `complete_history` (or the same tier) for that VIN → 422 ("already owned").
- **Upgrade reuses the same report row**: upgrading promotes the existing report to
  `complete_history` (same or new `reportId` is fine — the app uses whatever
  `confirm` returns — but one report per VIN per owner is the model).
- Prices are informational on the backend for now (purchases are mocked); store the
  amount charged per transaction so receipts/analytics work later.

---

## 3. Endpoints (full contract)

All requests carry an **`X-Device-Id`** header (anonymous device identity). Ownership of
reports = matching device id, or the authenticated Sanctum user once accounts exist.

### 3.1 `POST /api/lookup/vin` — free

Request: `{ "vin": "1HGCM82633A004352" }`

Response `200`:
```json
{ "vehicle": { "vin": "…", "year": 2018, "make": "Honda", "model": "Accord",
  "trim": "EX-L", "color": "Silver", "bodyStyle": "Sedan", "engine": "1.5L I4 Turbo",
  "transmission": "CVT", "driveType": "FWD", "fuelType": "Gasoline", "manufacturer": "Honda" } }
```
All vehicle fields except `vin` are optional/nullable. Invalid VIN (bad length/check digit) → 422.

### 3.2 `POST /api/lookup/plate` — cache-first (core business rule)

Request: `{ "plate": "ABC1234", "state": "TX" }`

Response `200`:
```json
{ "source": "cache",            // "cache" | "live"
  "lastVerifiedAt": "2026-05-02T00:00:00Z",   // ISO or null (never verified)
  "isLiveVerified": false,
  "vehicle": { … same Vehicle shape … } }
```
- **Always check `plate_vin_cache` first**; only fall through to the (mock) live
  provider on a miss. Write live results back to the cache.
- Fire-and-record a `plate_cache_hit` / `plate_cache_miss` signal (log or event) —
  cache hit rate is a launch success metric.

### 3.3 `POST /api/lookup/plate/refresh`

Request: `{ "plate": "ABC1234", "state": "TX", "reason": "user_rejected_cached_match" | "stale_cache" }`

Same response shape as 3.2 but forced `source: "live"`, updates the cache row.
Throttle this (per device) — it's the expensive call.

### 3.4 `GET /api/vehicle/{vin}/basic` — **identity only** (breaking change)

Response `200`:
```json
{ "vehicle": { … }, "summary": "2018 Honda Accord EX-L. VIN decoded and verified.",
  "estimatedValue": null }
```
- **Remove** recalls, safety ratings, fuel economy, complaints from this response —
  they are paid-tier data in v2. `estimatedValue` stays as an always-`null`
  transitional key (the app ignores it).
- Backed by `vehicle_basic_cache`.

### 3.5 `POST /api/report/purchase/start`

Request: `{ "vin": "…", "tier": "buyers_analysis" | "complete_history", "productId": "buyers_analysis" | "complete_history_upgrade" }`

Response `200`: `{ "purchaseToken": "…opaque…" }`

Validation:
- `tier` required, in `PaidTier`.
- `complete_history` requested but caller doesn't own `buyers_analysis` for this VIN → **422**.
- Tier already owned (same or higher) → **422**.
- Persist a pending-purchase row keyed by the token (vin, tier, device id, product id).

### 3.6 `POST /api/report/purchase/confirm`

Request: `{ "purchaseToken": "…", "appStoreTransactionId": "mock-txn-…", "platform": "ios" | "android", "tier": "buyers_analysis" | "complete_history" }`

Response `200`: `{ "reportId": "rpt_…", "tier": "buyers_analysis" }`

- Token must match a pending purchase for this device; `tier` must match the started tier.
- `buyers_analysis` → generate/fetch analysis via providers, create `premium_reports` row with `tier`.
- `complete_history` → find the caller's existing analysis report for this VIN,
  generate the history section, **promote the row's tier**, return its id.
- Idempotent: confirming the same token twice returns the same `reportId` (no double report).
- Receipt validation is a no-op for now (mock purchases) — leave a clearly marked TODO
  for RevenueCat/App Store server-side validation.

### 3.7 `GET /api/report/{id}` — the big one (v2 shape)

Ownership-gated (device id or user). Response `200`:

```json
{
  "id": "rpt_01H…",
  "tier": "complete_history",
  "vehicle": { … Vehicle … },
  "analysis": {
    "buyScore": { "score": 82, "band": "green", "reason": "Clean title, one owner, mileage on trend." },
    "recommendation": "Solid buy at the right price. Verify the open recall was completed.",
    "estimatedValue": 17250,
    "msrp": 28900,
    "depreciationPct": 40,
    "suggestedOffer": 16400,
    "negotiationAdvice": "Open at $16,000 citing the open recall and due 60k service.",
    "mileageHistory": [
      { "date": "2019-03", "mileage": 12400, "source": "State registration" },
      { "date": "2021-06", "mileage": 38900, "source": "Service record" }
    ],
    "rollbackDetected": false,
    "maintenanceOutlook": "60k service due soon (~$450). CVT fluid change recommended.",
    "factoryEquipment": ["Leather seats", "Sunroof", "Honda Sensing"],
    "photoUrls": ["https://<backend>/storage/vehicles/<vin>/1.webp"],
    "openRecalls": [ { "id": "21V-123", "summary": "Fuel pump may fail…", "component": "Fuel system" } ],
    "manufacturerCommunications": 14,
    "complaintTrends": "Most complaints concern infotainment; no drivetrain pattern."
  },
  "history": {
    "accidents": 1,
    "titleBrands": [],
    "thefts": 0,
    "odometerIssues": 0,
    "owners": 2,
    "auctionRecords": [
      { "date": "2022-11-04", "location": "Dallas, TX", "price": 15200,
        "photoUrls": ["https://<backend>/storage/vehicles/<vin>/auction-1.webp"] }
    ],
    "serviceHistory": [
      { "date": "2021-06-12", "description": "Oil change, tire rotation", "mileage": 38900 }
    ]
  }
}
```

- `history` is **`null` for `buyers_analysis`** reports, populated for `complete_history`.
- `buyScore` is always score **and** reason together; `band`: green ≥ 80, yellow 60–79, red < 60.
- Nullable-by-design (a provider may have nothing): `estimatedValue`, `msrp`,
  `depreciationPct`, `suggestedOffer`, `negotiationAdvice`, `maintenanceOutlook`,
  `complaintTrends`, auction `price`, `owners`. Arrays are `[]` when empty, never null.

### 3.8 `POST /api/history/sync` (already routed, Sanctum)

Unchanged for now — accepts local history after login. No work needed this round
beyond keeping it compiling.

---

## 4. Database changes

- `premium_reports`: add **`tier`** (string/enum: `buyers_analysis` | `complete_history`),
  add `device_id` (nullable, indexed) if not present, `amount_paid` (decimal), keep
  `report payload` (JSON) storing the v2 shape or regenerate-on-read — either is fine
  as long as reads are stable.
- Pending purchases: table (or columns) for `purchase_token`, `vin`, `tier`,
  `device_id`, `product_id`, `status`, `transaction_id` — needed for idempotent confirm.
- `plate_vin_cache` / `vehicle_basic_cache`: already exist; ensure
  `last_verified_at` is stored for 3.2's `lastVerifiedAt`.

---

## 5. Provider abstraction (all mock for now)

PHP interfaces bound in a service provider, mock implementations only (spec §19):

| Interface | Feeds | Mock must produce |
|-----------|-------|-------------------|
| `PlateToVinProvider` | 3.2 / 3.3 | Deterministic VIN per (plate, state) |
| `VinDecodeProvider` | 3.1 / 3.4 | YMM/trim/specs per VIN |
| `RecallProvider` | analysis `openRecalls` | 0–2 recalls per VIN |
| `MarketValueProvider` | `estimatedValue`, `msrp`, `depreciationPct`, `suggestedOffer` | Consistent set (see §6) |
| `AiSummaryProvider` | `buyScore`, `recommendation`, `negotiationAdvice`, `maintenanceOutlook`, `complaintTrends` | Score + prose matching the data |
| `VehicleHistoryProvider` | `history` block + `mileageHistory`, `rollbackDetected` | Accidents/title/theft/odometer/owners/service |
| `AuctionPhotoProvider` | `auctionRecords[].photoUrls`, analysis `photoUrls` | URLs to WebP files served by this backend |

---

## 6. Mock data coherence rules (important — this is what makes demos believable)

All mock data must be **deterministic per VIN** (hash-seed the generator with the VIN,
never `rand()`), so the same VIN always returns the same story, and must be
**internally consistent**:

1. `rollbackDetected === true` **iff** `history.odometerIssues > 0`.
2. If rollback: `mileageHistory` must actually show a later reading **lower** than an
   earlier one. If no rollback: readings strictly increase.
3. `openRecalls` identical wherever recalls appear (analysis vs any future endpoint).
4. `buyScore` coheres with the facts: salvage title / rollback / 2+ accidents can't be
   green; clean everything shouldn't be red. `reason` must cite the actual facts.
5. `suggestedOffer` < `estimatedValue` < `msrp`; `depreciationPct` ≈ `(msrp − estimatedValue) / msrp × 100`.
6. `titleBrands` non-empty ⇒ score band ≤ yellow and `recommendation` mentions it.
7. `owners`, `accidents`, `serviceHistory` counts plausible for the vehicle's age.
8. A minority of VINs (~1 in 5) should be "problem cars" so both green and red paths
   are testable; make at least one known VIN of each kind and note them in the
   backend README for demos.

---

## 7. Photos (WebP)

- Backend stores/serves all vehicle & auction photos itself; the app only consumes
  `photoUrls: string[]`.
- Re-encode any provider image to **WebP** on ingest (size/quality win), store under
  `storage/vehicles/{vin}/…`, serve via public storage URLs.
- For mocks: a small set of bundled placeholder WebP images is enough; return 0–3 per
  vehicle (empty array is a valid, common case).

---

## 8. Cross-cutting

- **Throttle** lookup + purchase routes per device id (plate refresh especially).
- **Scribe/API docs**: update docblocks so generated docs match the v2 shapes.
- **Analytics-ish logging**: log cache hit/miss and purchase events server-side.
- Keep response keys **camelCase** exactly as shown (the app does no key mapping).

## 9. Test coverage (backend)

- Plate lookup: cache miss → live → second call hits cache (`source: "cache"`).
- Plate refresh forces live + updates `lastVerifiedAt`.
- VIN lookup rejects invalid VINs (length, I/O/Q, check digit) with 422.
- Basic endpoint returns identity only (asserts recalls/safety keys absent).
- Purchase start: 422 on `complete_history` without owned analysis; 422 on re-buy.
- Purchase confirm: creates tiered report; upgrade promotes existing report;
  idempotent on duplicate confirm; wrong device gets 403/404 on `GET /report/{id}`.
- Report shape: full v2 contract snapshot for both tiers (`history` null vs populated).
- Coherence: rollback ⇔ odometerIssues, mileage monotonicity, offer < value < msrp.
- Determinism: same VIN twice → identical report payload.

## 10. Open questions / deferred (do NOT build yet)

- **How the $0.25 plate fee is actually charged** — a $0.25 IAP is economically bad
  (Apple's cut + minimum price tiers). Options: bundle into analysis price, small
  credit ledger, or first-plate-free. Business decision pending.
- **$2.74 after plate credit needs a second RevenueCat SKU** (or an offer/discount) —
  decide when real IAP is wired.
- Real receipt validation (App Store / Play / RevenueCat webhooks).
- Real providers + legal checklist (caching rights, resale, DPPA) before any real key.
- Account sign-in + `history/sync` claiming device-id purchases into a user.
