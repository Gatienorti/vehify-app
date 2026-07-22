# Google Play listing — Vehify

Everything to paste into Play Console when the developer account clears.
Keep claims calm/hedged (CLAUDE.md: never promise data a provider can't deliver,
never owner identity).

## App details

- **App name** (30 chars max): `Vehify: VIN & Plate Check`
- **Category**: Auto & Vehicles · App (free, contains in-app purchases)
- **Contact email**: support@vehify.app
- **Privacy policy**: https://vehify.app/privacy
- **Website**: https://vehify.app

## Short description (80 chars max)

`Scan a plate or VIN. Instant free vehicle check, recalls and buyer reports.`

## Full description

Verify before you buy. Vehify is the fastest way to check out a used car —
point your camera at the license plate or VIN and get an instant, free
vehicle summary.

**Scan anything**
- License plates — automatic plate and state detection
- VIN barcodes and QR codes on the door jamb or windshield
- Or just type a plate or VIN

**Free basic check**
- Year, make, model, trim and full specs
- Open safety recalls
- No account, no sign-up — scan and see

**Buyer's Analysis — $1.99**
Is this model a good buy? Get a Model Score with plain-English reasons,
recalls, complaints and safety ratings, comparable listings, and a
maintenance outlook.

**Complete Vehicle History — upgrade**
Is this exact car a good buy? Add the per-VIN records: accident and title
checks, odometer readings, theft records, owner count, plus market value,
a suggested offer, and a Buy Score for this specific vehicle.

**Built for one-time buyers**
No subscription. No credits to manage. Buy one report for the one car
you're looking at, and it's yours — reports live in your History and can
be restored on any device.

Vehify reports vehicle identity and history only — never owner or personal
information.

## Data safety form (mirror of iOS App Privacy, published 2026-07)

Collected, all "App functionality", linked to user, **no tracking, no third-party sharing**:

| Data | Play category |
|------|---------------|
| Name | Personal info → Name |
| Email | Personal info → Email address |
| User ID | Personal info → User IDs |
| Device ID | Device or other IDs |
| Purchases | Financial info → Purchase history |
| Search history | Web browsing/search → Search history (in-app vehicle lookups) |

- Data encrypted in transit: **yes**
- Users can request deletion: **yes** (in-app account deletion exists)
- If an analytics SDK is ever added: update this + iOS App Privacy together.

## Content rating questionnaire

Utility/productivity app: no violence, no sexual content, no gambling, no
user-generated content, no social features, no location sharing. Expected
rating: Everyone / PEGI 3.

## Assets needed (user to produce)

- **Feature graphic 1024×500** (required) — brand blue gradient + wordmark +
  "Verify before you buy" is enough.
- **Phone screenshots** (min 2): reuse the iOS screenshot set BUT panels 3–4
  shipped with mock-era Camry data — replace with real-data captures from the
  Android build.
- App icon auto-derives from the adaptive icon in the AAB; the 512×512 hi-res
  icon field can use `assets/icon.png` exported at 512.

## IAP products to create (exact ids — must match RevenueCat/src/config/pricing.ts)

| Product id | Name | Price |
|------------|------|-------|
| `buyers_analysis` | Buyer Report | $1.99 |
| `complete_history_upgrade` | Premium Report Upgrade | $2.99 |
| `report_refresh` | Report Update | $2.99 |

All "managed products" (one-time). RevenueCat handles consumption.

## RevenueCat link (after first AAB upload)

1. Google Cloud Console → create service account → JSON key.
2. Play Console → Users & permissions → invite the service account with
   Financial data + Manage orders permissions.
3. RevenueCat dashboard → project `proj12eeb7e8` → app "Vehify Android"
   (`app2096fbfbb4`) → upload the JSON.

## Don't forget

- Play App Signing SHA-1 (Console → App integrity) → add to the Android OAuth
  client in Google Cloud project `297086662226`, or Google sign-in breaks on
  Play-installed builds.
- Closed test (personal account): 12 testers, 14 continuous days, before
  production access.
- After launch: set `PLAY_STORE_URL` in vehify-web prod env — the Landing
  page's Google Play button appears automatically.
