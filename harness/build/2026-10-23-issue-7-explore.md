# Issue #7 — Explore interaction refactor, then visual refinement

- Sole current task: https://github.com/JKd121/nearby-places/issues/7 (updated 2026-10-22T17:20:01Z; no comments at entry).
- User authorized implementation on PR #5's existing branch and PR update, without master merge or production deployment.
- Worktree: `C:\Users\lenovo\.codex\worktrees\nearby-v2-1-package1\地点聚合器`; branch `codex/nearby-v2.1-package1`.
- Entry HEAD: `c66dfdcd2dafd43d768b9867adaa6bdc7550e596`, clean, equal to remote/PR #5 head. PR open/unmerged; master unchanged at `3bc08d4`.
- State: LOCAL_VERIFIED. Issue #4 remains historical scope; the user's Issue #7 instruction supersedes its old current-task pointer.

## Scope and non-goals

First fix state/space organization: bounded Explore workspace; compact location entry/candidates/summary; persistent collapsible conditions; independently scrolling results beside a dominant future-map region. Mobile uses the map canvas and a collapsible bottom result panel rather than a long document. Retain APIs, resolver/search core, history persistence/replay semantics, categories/radii, sorting/filtering/page reveal/provider page 2 and external AMap links.

Then refine only authorized surfaces: quieter shell, reduced borders/radii, concise Home/My Places, scannable History. Add a reproducible frontend lint command because none exists. No real SDK, auth, favorites, schema/migration, category limit, search API rewrite, CI/Preview trigger changes, original-checkout edits, master merge or production deployment.

## Reference and visual contract

Read official references: Linear https://linear.app/now/behind-the-latest-design-refresh ; Google Maps https://support.google.com/maps/answer/3092445?hl=en ; Wanderlog https://wanderlog.com/en . Borrow quieter orientation/consistent headers, a collapsible result side panel and list/map co-presence. Do not copy branding, prose or pixel layouts. No large compass, pseudo-cartography, marketing fill or fictional data.

- Desktop 1440x900: compact location/condition toolbar, scrollable ~380px result rail, map region taking remaining width; viewport height bounded beneath the shared header.
- Tablet 820x1180: maintain list/map workspace with narrower rail, navigation collapsible; dialogs remain usable.
- Mobile 390x844: location toolbar always reachable, compact condition summary; map canvas remains in view; result bottom panel has collapsed/expanded controls and an internal scroll area. Conditions/location selection use bounded, keyboard-accessible dialogs. No document growth after search.
- Retain Nearby teal accent with neutral surfaces/system type; use one icon family only for meaningful actions. Explicit map-not-connected disclosure.
- Cover input/resolving/candidate/confirmed/no-result/error, expanded/collapsed conditions, search progress/partial/all-failed/empty/results, history restore, stale requests, long names, keyboard focus and reduced motion.

## Ordered verification

1. Capture actual c66dfdc production-UI baseline at desktop/mobile/tablet into `issue-7-evidence/before/`, using the same isolated DB/provider fixture. Preserve Issue #4 evidence.
2. Implement structural interaction, run existing tests/types/build and focused browser behavior/geometry checks; do not polish other pages before these pass.
3. Apply visual refinement, run lint/types/unit/build and full browser suite; capture matching after screenshots and geometry/results summary. Synthetic fixtures are labeled, never live-provider proof.
4. Independent read-only code/visual review, bounded correction/recapture if needed, then reverify affected version. Report any unmet criteria explicitly.
5. Commit/push same branch, update/attach PR #5 with before/after comparisons, file/dependency changes, actual checks and limits. Await human review; no merge or production deploy.

## Results

Entry baseline checks PASS. Before screenshots: 18 PNGs, original 7 browser tests PASS (27.2s). Structural interaction build/type check PASS. The 14-case interaction suite reached 13 PASS plus one incorrect synthetic cost-sort expectation; corrected that expectation and its focused rerun PASS (3.6s) before visual refinement. Earlier failures exposed a leftover page wrapper that broke the mobile workspace, fixed by rendering SearchApp directly; overly broad alert selectors and missing sort accessible name were also corrected. These are phase-entry evidence; final results below supersede them.

Existing dependency audit warnings remain a separate maintenance issue; no framework upgrade here. Added only frontend lint development tooling; core/APIs/schema untouched.

## Independent review and bounded correction

Fresh read-only reviewer `/root/issue7_finish_reviewer` opened 13 required after captures and the three required before counterparts, reviewed the diff and returned `fix`. The workspace/fidelity/quiet Operate composition passed at its scope. One material P2: editing categories/radius during resolver loading could increment the shared request ID and leave phase stuck at resolving. Fixed by disabling the condition entry only during resolution; existing input editing can still cancel a request. Added regression asserting disabled entry, completion, subsequent category/radius editing and enabled retry.

The batched visual inspection measured auxiliary text contrast below 4.5 on map/sidebar; changed only `--text-tertiary` from `#64766e` to `#5c6e65` (4.73 on `#eef0ec`, 4.94 on `#f3f5f1`). Both fixes share one rebuild/recapture, then reviewer verdict. Before corrections, full visual suite 14/14 PASS (36.3s); these results are superseded for the changed version. After corrections lint/check/build PASS; final browser run 14/14 PASS (36.3s). Mechanical design detector ran once, returned `[]`.

The same reviewer reopened all 13 required final captures and scored the resolver correction **resolved**, independently confirmed auxiliary contrast ratios and returned `ship` for the scored corrections. This was a limited verdict, not a new full-surface approval. Read-only documentation handoff `/root/issue7_documentation_check` found README behavior/scope consistent; its pending-state notes were finalized here. No unsolicited product/design bootstrap was performed.

## Final checks and evidence

| Check | Executed result |
| --- | --- |
| `npm run lint` | PASS, 0 warnings; frontend/browser TS + Hooks rules |
| `npm run check` | PASS, core and web type generation/check |
| `npm test` | PASS, 103/103 existing tests; final rerun after review corrections |
| `npm run build` | PASS, optimized webpack production build, all four business routes |
| `npm run test:browser` | PASS, 14/14, 0 flaky/skipped, final 36.3s |
| `git diff --check` | PASS |
| Independent code/visual review | One P2 fixed; limited verdict `ship`, evidence reopened |

See `issue-7-evidence/README.md` for matching before/after comparisons, `browser-summary.json` extracted from the final Playwright HTML report, and `verification.json` for PNG dimensions/hashes and reviewed source fingerprints. 18 before + 25 after PNGs; old Issue #4 evidence preserved. Explore's populated desktop document changes from 1440×1666 to 1440×900; phone from 390×2083 to 390×844 at the same viewport sizes. Tests assert document height/width bounds, visible result panel, condition persistence/focus, long candidate names and all preserved primary flows. Images are actual renders, not design comps.

## Changed boundaries, dependencies and limits

- UI: four page bodies, shell/history markup, Explore return/focus/phase presentation, one reused Radix Dialog wrapper, shared tokens and a dedicated Explore stylesheet. Existing resolver/search/history Store/Hook/Service/Repository/algorithms and all production API routes remain unchanged. The historical `app/search.css` remains in Git but is no longer imported.
- Testing/tooling: expanded browser fixtures/tests and separate evidence destinations; frontend lint command/config added. Only new direct dev dependencies: `eslint@10.13.0`, `@eslint/js@10.0.1`, `typescript-eslint@8.72.0`, `eslint-plugin-react-hooks@7.1.1`. Install refreshed two browser-data transitive entries: baseline-browser-mapping 2.11.21→2.11.30 and caniuse-lite 1.0.30001810→1.0.30001819. No Next/React/Prisma/runtime dependency upgrade. Existing audit remains 5 high + 1 critical; separate maintenance required before any future production release.
- Unchanged: `app/api/`, `src/search/`, `src/amap/`, history persistence code, Prisma Schema/migrations, CI/Preview triggers. No credentials read/copied, environment files created/edited or database migration executed. Build uses only process-local non-sensitive localhost placeholders; fixtures perform no real provider/DB calls.
- Original checkout remains on `codex/history-confirmed-location` at `16503c15521f6cc17d13e5c81d16e099c7174ebe` with modified PLANS.md and existing untracked Preview evidence. All writes were confined to this Worktree. Its pre-existing changes were not staged/reset/cleaned.
- Evidence covers Windows Chrome viewport behavior, not physical iOS/Android keyboards/safe areas, Firefox/WebKit or live AMap/PostgreSQL. No real SDK, markers/list linkage, authentication, favorites or custom lists; all intentionally out of scope. History retains its existing recent-record window, not full-text search or account sync. No product-owner acceptance is inferred from automated checks/reviewer verdict.
- Delivery: same development branch and PR #5; no merge or production deployment. Remote CI/Preview results are reported on the PR after push, distinct from local acceptance.
