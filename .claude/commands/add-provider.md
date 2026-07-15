Scaffold a swappable vehicle-data provider called $ARGUMENTS in the Laravel backend at `../vehify-web`.

This runs in the backend repo (`cd ../vehify-web`). Prefer the `provider-builder` agent. See CLAUDE.md → Backend Contract and spec §19–21.

Steps:
1. Create the interface `app/Providers/Vehicle/Contracts/$ARGUMENTSProvider.php` — small, typed method surface returning DTOs/arrays (no raw provider JSON leaking upward).
2. Create the **default mock** `app/Providers/Vehicle/Mock/Mock$ARGUMENTSProvider.php` returning realistic fixtures.
3. Create a **real stub** `app/Providers/Vehicle/Real/<Vendor>$ARGUMENTSProvider.php` using the `Http` client, keys from config/env, with TODOs where licensing must be confirmed.
4. Bind the contract → implementation in `VehicleProviderServiceProvider` based on `config('vehicle.providers.<name>')`; default to the mock.
5. Add env keys to `config/vehicle.php` and `.env.example` (never commit real keys).
6. Add a Pest/PHPUnit test resolving the interface from the container.

Guardrails: plate→VIN checks `plate_vin_cache` before any live call; return `source` + `last_verified_at`; never expose owner identity (DPPA); keep the provider on the mock until caching/redistribution rights are confirmed.
