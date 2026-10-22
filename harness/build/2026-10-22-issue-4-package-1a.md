# Issue #4 — Nearby V2.1 Package 1A

- Sole task source: https://github.com/JKd121/nearby-places/issues/4 (updated 2026-10-22T12:23:34Z; no comments at entry).
- Authorization: user requested implementation, branch commit/push and PR; no master merge or production deployment.
- Worktree: `C:\Users\lenovo\.codex\worktrees\nearby-v2-1-package1\地点聚合器`.
- Branch/base: `codex/nearby-v2.1-package1` / `3bc08d4f7636b72c7206f1d9e4cb6272c212e41b`. Clean and +0/-0 at entry.
- State: LOCAL_VERIFIED — branch PR handoff; no merge/deploy authorization.

## Goal, scope and boundary

Deliver four navigable, consistent pages while preserving existing search/history. Missing shell capability plus behavior-preserving search relocation. Adapt official shadcn/ui sidebar primitives with Tailwind v4; keep the current application and search core.

Scope: shared header, collapsible sidebar, mobile navigation; Home, Explore, My Places, History; real recent history and continue-search actions; issue-related docs, tests and browser evidence.

Non-goals: real map SDK/markers/linkage, authentication, favorites/list backend, schema/migrations, new search semantics or five-category cap, production config, CI/Preview trigger changes, master merge or production deploy.

## Visual and reuse contract

- Operate mode; extend the incumbent teal identity, Chinese system typography and search semantics. Warm neutral canvas, dark teal navigation, white work areas and consistent library icons.
- KEEP resolver/API/service/repository/validation/sort/store contracts and inline Explore history. ADAPT sidebar-16's full-width header, below-header sidebar and content. DO NOT COPY demo users, teams, metrics, projects or map imagery.
- Home: primary start action and real recent activity. My Places: intentional empty collection surface and clear persistence boundary. History: recent records, delete/retry and continue-search. Explore: conditions/results and an explicitly unconnected future-map reserve.
- Desktop 1440x900: shared header and foldable navigation. Tablet 820x1180: compact composition. Mobile 390x844: accessible navigation drawer, stacked work areas, no horizontal overflow.
- Cover loading, empty, error, real records, search progress/results, long names, keyboard focus and reduced motion.
- References inspected: https://ui.shadcn.com/r/styles/new-york-v4/sidebar-16.json ; https://ui.shadcn.com/r/styles/new-york-v4/sidebar.json ; https://tailwindcss.com/docs/installation/using-postcss . No external imagery required.

## Implementation and verification

1. Add necessary UI/build/browser-test dependencies inside this worktree. Do not copy environment files or credentials from the original checkout.
2. Isolate legacy search styles from shared primitives. Add four routes and keep APIs/schema unchanged.
3. Home/History read visitor history. Continue links carry only a record ID; Explore reloads that visitor's history, validates the record and uses the existing snapshot replay. No raw location payload in URLs or persistent browser cache.
4. Run existing tests, type checks and production build; lint only if configured. Use only a non-sensitive localhost DB placeholder when necessary, never a real database.
5. Browser regression: production UI plus the existing isolated memory-DB/synthetic-provider fixture. Cover navigation/direct refresh, menu/collapse, search/save/replay/delete and empty/error states. Capture desktop/mobile/tablet screenshots. These are mock-boundary checks, not live AMap/PostgreSQL evidence.
6. Review actual code/screenshots, repair within scope and reverify. Record results and limitations; commit/push the branch, create/attach PR, stop without merge/deploy.

## Evidence

Entry checks PASS. Original checkout and historical evidence remain untouched.

### Executed verification — 2026-10-22

- Prisma Client generation PASS with a process-local localhost placeholder. No environment file, database connection or migration.
- `npm test`: 103/103 PASS.
- `npm run check`: PASS; production build PASS (all four routes present).
- Lint: NOT CONFIGURED in the baseline; no lint result claimed.
- `npm run test:browser`: final 7/7 PASS, 19.1s, local Chrome 155.0.8059.85 / Playwright 1.64.1. Routes, refresh, current-page state, sidebar collapse, mobile dialog/keyboard/focus, no horizontal overflow, search/save/inline replay, Home replay, refresh/readback/delete, history loading/error/retry and invalid replay covered.
- Eighteen real production-UI PNGs captured at viewport 1440x900, 390x844 and 820x1180. Full-page captures start at scrollY=0; actual file height may exceed viewport. Filename `fixture` denotes synthetic provider/in-memory DB records. Screenshot index and source hashes: `issue-4-evidence/verification.json`.
- First browser run exposed two test-driver problems: clicking clipped native input instead of visible label, and ambiguous alert matching Next's route announcer. Corrected selectors; full rerun passed. Independent review requested recapture of populated Explore because sticky navigation was captured at nonzero scrollY; capture helper corrected, full suite passed again, reviewer reopened both files and returned `ship` for the recapture finding.
- Independent read-only reviewer inspected shell, primitives, route wrappers, RecentHistory, SearchApp replay changes, scoped CSS and representative empty/populated desktop/mobile/tablet screenshots. No blocking production finding. Mechanical design detector returned `[]`.
- Search APIs, provider/search/history core, history store/hook, Schema/migrations and CI workflow show no diff from baseline. No real provider/DB calls or production deployment used as evidence.

### Dependencies and limitations

- Added Tailwind/PostCSS, Radix, Lucide, cva/clsx/tailwind-merge and Playwright; exact versions are locked. Next 16.3.3, React 19.2.0 and Prisma 7.10.0 stay at baseline. Existing lock entries changed only for PostCSS 8.5.23 to 8.5.31 and its nanoid/source-map-js patch dependencies.
- `npm audit` reports 5 high and 1 critical findings in the existing Next/Prisma-related dependency trees (Next, sharp, Prisma, @prisma/config, deepmerge-ts, mysql2). No automatic audit fix or framework upgrade; separate maintenance follow-up is needed before production release. This PR does not authorize release.
- History pages intentionally expose existing recent-record limits, without full-text search, all-history pagination or cross-account/device sync. A replay ID absent from the current visitor's visible recent records produces an honest recovery message.
- Browser evidence covers Chrome with desktop/mobile/tablet viewport sizes, not physical iOS/Android, Firefox/WebKit, long-name fixtures or live PostgreSQL/AMap. Preview/CI status is reported separately from local verification.
