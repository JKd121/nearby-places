# AMap Spike QPS and Hong Kong Validation Fix Plan

## Goal

Correct the two observed Spike failures: eight simultaneous Around requests exceeding QPS, and an obviously non-Hong-Kong geocode match being used as the Hong Kong search centre.

## Scope and approach

- Replace the eight-category `Promise.all` burst with a plain sequential loop.
- Wait approximately 500 ms after each Around attempt, including failed attempts, using a tiny injectable delay function so tests use no wall-clock sleep. This also spaces the last request for one test place from the first request for the next place.
- Preserve category-level error isolation and the existing AMap `info`/`infocode` text.
- Change the default Hong Kong test input to `香港特别行政区九龙达之路香港城市大学`; retain `深圳北站`.
- Add `province`, `city`, and `district` to the geocode result parsed from AMap, tolerating missing/array-valued fields as `null`.
- Print matched address, province, city, district, location, and level.
- Add a Smoke-only validation rule: when the query includes `香港`, require at least one of formatted address/province/city/district to contain `香港`. Otherwise print a distinct `geocode validation failure` containing the returned administrative fields and coordinates, and skip all eight Around searches for that place.
- Add deterministic tests proving category requests never overlap, delay occurs after success/failure, later categories continue after failure, and an obvious Hong Kong false match is rejected before search orchestration.

## Non-goals

- No retries, exponential backoff, third-party limiter, scheduler, generic place parser, autocomplete, candidate selector, alternate endpoint/data source, Web App, UI, database, map, or product feature.

## Acceptance criteria

- At most one Around request is in flight; attempts are separated by the configured ~500 ms delay in the real smoke run.
- One category failure does not stop subsequent categories.
- Default smoke inputs are exactly `深圳北站` and `香港特别行政区九龙达之路香港城市大学`.
- An input containing `香港` that resolves only to the observed Chengdu-style administrative result is labeled as validation failure and triggers zero Around searches.
- Existing tests remain green and focused new tests pass.
- Real response categories remain distinguished as geocode API failure, geocode validation failure, QPS/API category failure, and successful empty result.

## Verification plan

1. Run `npm test`, `npm run check`, and `npm run build`.
2. Run the smoke command without a key and confirm the existing explicit failure.
3. Inspect the implementation for absence of Around-request `Promise.all`, secret leakage, retries, and out-of-scope dependencies/features.
4. If a Key is present, run `npm run smoke -- 深圳北站 香港特别行政区九龙达之路香港城市大学` and report all raw `info`/`infocode` observations. If absent, report both real retests as not run and keep the Spike blocked rather than infer results from the user's prior run.

## Phase boundary

Stop after this correction, review, and available verification. Do not enter Web App or UI development.

## Approval

- Approved: 2026-09-10
- Clarification: wait about 500 ms only between adjacent category requests; do not delay after the final category. Keep all tests deterministic with an injected fake delay.
