# Harness Build Log

## 2026-09-10 — Initial bootstrap

- Repository root: `C:\Users\lenovo\Documents\ChatGPT\地点聚合器`
- Baseline HEAD: NONE (repository has no commits)
- Initial Git status: `master`, no commits, untracked `.serena/`
- Discovered project documents: none; README missing; package manifest missing; specification files missing
- Created Harness artifacts: `AGENTS.md`, `PLANS.md`, `harness/build/`, `harness/build-log.md`
- Business implementation performed: none
- Result: `PROJECT_BOOTSTRAP_APPROVED` → `CLARIFY`

## 2026-09-10 — AMap Spike local implementation

- Approved phase: AMap Web Service data-capability Spike only
- Added: minimal Node.js/TypeScript metadata, AMap category/client/types/distance modules, smoke script, focused unit tests, environment example, and README
- `npm test`: PASS (5/5)
- `npm run check`: PASS
- `npm run build`: PASS
- `npm run smoke` without `AMAP_WEB_SERVICE_KEY`: expected FAIL with exit code 1 and an explicit missing-key message
- Dependency audit during install: 0 vulnerabilities
- Real Shenzhen/Hong Kong API calls: NOT RUN; key unavailable
- Result: implementation and local verification complete; full acceptance `BLOCKED` pending a real key

## 2026-09-10 — QPS and Hong Kong geocode-validation correction

- Root cause: `Promise.all(CATEGORIES.map(...))` launched all eight Around requests concurrently, creating the observed QPS burst.
- Request strategy: sequential category loop with an injected 500 ms delay between adjacent Around attempts, including after failed attempts; no delay after the last category.
- Hong Kong input: changed to `香港特别行政区九龙达之路香港城市大学`.
- Validation: geocode output now includes address/province/city/district/location/level; an obvious non-Hong-Kong administrative match skips all Around requests and reports `geocode validation failure` with returned details.
- `npm test`: PASS (8/8)
- `npm run check`: PASS
- `npm run build`: PASS
- `npm run smoke` without `AMAP_WEB_SERVICE_KEY`: expected FAIL with exit code 1 and explicit missing-key message
- Review: no concurrent Around aggregation, retry, backoff, scheduler, queue, third-party rate limiter, new runtime dependency, or product/UI scope found
- Real Shenzhen/Hong Kong retest: NOT RUN; key unavailable in this task process
- Result: correction locally verified; real API verification remains `BLOCKED` pending key injection
