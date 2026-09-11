# AMap Web Service Data Spike Plan

## Goal

Prove whether a minimal Node.js + TypeScript command-line program can geocode a place name and retrieve, normalize, sort, and print nearby POIs for the eight approved keyword categories through AMap Web Service APIs.

## Scope

- Add the smallest runnable Node.js/TypeScript project using native `fetch`.
- Read `AMAP_WEB_SERVICE_KEY` only from the process environment.
- Geocode an input name through `https://restapi.amap.com/v3/geocode/geo`.
- Query `https://restapi.amap.com/v5/place/around` once per configured category with `show_fields=business`, a 3,000 m radius, distance sorting, and no POI typecode taxonomy.
- Normalize every returned POI to the approved `Place` model. Treat absent/array/empty optional commercial values as `null`.
- Compute `distanceMeters` from the query center and POI coordinates because the current POI 2.0 response schema does not document a distance field; sort the normalized records ascending by that value.
- Continue other category requests when one category fails and report category-level failures.
- Provide a smoke script that accepts place names and defaults to the two required locations, printing at most five results per category plus a compact field-availability summary.
- Add `.env.example`, README usage/limitations, compiler config, and minimal package metadata.

## Non-goals

- No Web App, UI, React, Next.js, Tailwind, database, Prisma, authentication, map SDK, Meituan code, persistent cache, production service layer, complex typecode taxonomy, or future product architecture.
- No hard-coded API key and no fabricated API results.
- No automated retry/rate-limit framework or overseas endpoint integration in this Spike.

## Architecture and affected areas

- `src/amap/types.ts`: public normalized and small wire-response types.
- `src/amap/categories.ts`: the eight-keyword configuration.
- `src/amap/client.ts`: geocoding, one generic nearby search, response validation/normalization, and distance calculation.
- `scripts/amap-smoke-test.ts`: orchestration, category isolation, console output, and observed availability summaries.
- Root metadata/docs: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`.

## Acceptance criteria

- Missing key, failed geocode, zero geocodes, API-declared errors, zero category results, malformed/missing optional fields, and isolated category failures are handled explicitly.
- Exactly the eight configured keyword searches run for each successfully geocoded input at 3,000 m.
- Output is grouped by category, sorted by `distanceMeters`, capped at five POIs, and prints `null` for absent `cost`, `rating`, or `tag`.
- Both required place names are actually attempted with a real key; the final report distinguishes successful observations from blocked checks.
- Final evidence includes geocoding outcomes, per-place/per-category counts, field availability, regional differences, and any permission/field limitations.

## Verification plan

1. Install only TypeScript development tooling needed to run/type-check the script.
2. Run `npm run check` for a no-emit TypeScript compile.
3. Run the smoke command without a key and confirm the explicit missing-key failure.
4. If `AMAP_WEB_SERVICE_KEY` is present, run `npm run smoke -- 深圳北站 香港城市大学`, retain sanitized output, and report all requested observations. If absent, stop real API verification at that precise limitation and do not fabricate results.
5. Review the final diff for scope, credential leakage, duplicated category functions, and error-isolation behavior before declaring completion.

## Phase boundary

This phase ends after the CLI Spike, relevant review, and executed verification report. Product/UI work remains deferred and requires a separate approved phase.

## Known trade-offs

- Keyword searches maximize first-pass simplicity but can produce noisy or incomplete category matches.
- Calculated straight-line distance is deterministic and sortable but is not walking/driving distance and is not evidence that AMap returned a native distance property.
- AMap documents `tag` mainly for food POIs and `rating`/`cost` mainly for dining, hotels, attractions, and cinemas, so nulls are expected in several requested categories.

## Approval

- Approved: 2026-09-10
- Added constraints: explicitly send `sortrule=distance` and `show_fields=business`; label `distanceMeters` as locally computed rather than API-returned; retain API error details for Hong Kong capability testing; do not mark acceptance complete until a real key is used.
