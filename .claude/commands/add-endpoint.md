Add a new RTK Query endpoint to `src/services/api.ts` for $ARGUMENTS.

Argument format: `<query|mutation> <name> <path> [tagTypes]`
Example: `mutation lookupPlate /api/lookup/plate PlateLookup`
Example: `query getReport /api/report/:id Report`

Steps:
1. Read `src/services/api.ts` to match existing patterns.
2. Add the endpoint inside the `endpoints` builder:
   - Queries → `providesTags`; mutations → `invalidatesTags`.
   - Type the request and response using shared types from `src/types/api.ts`. **No `any`.**
   - The response shape MUST match the Laravel backend contract in `../vehify-web` (see CLAUDE.md → Backend Contract). If types drift, update `src/types/api.ts`.
3. Add any new tag types to the `tagTypes` array.
4. Export the auto-generated hook (`use<Name>Query` / `use<Name>Mutation`).
5. Reminder for lookup endpoints: cache-first behavior lives in the backend — the app just consumes `source` (`cache`|`live`) and `lastVerifiedAt`. Don't reimplement caching client-side.
6. Run `npx tsc --noEmit` and `npm test -- api`.
