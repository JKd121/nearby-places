# Issue #10 — Stage B checkpoints

## Authority and preflight

Read Issue #10, Issue #6, Issue #8, PR #9 and PR #5 bodies/discussions and relevant local implementations. Issue #10 is the sole current authority, approving Stage A cc88851 and treating navigation width discontinuity as non-blocking. Remote PR #5 remains6975b3d/base master3bc08d4; PR #9 remainscc88851/base referencec46fac4. Original checkout16503c1 retains dirty PLANS and untracked Preview evidence; existing PR Worktrees clean. No baseline conflict. Managed independent worktree `C:\Users\lenovo\.codex\worktrees\nearby-v2-1-stage-b\地点聚合器`, branch `codex/nearby-v2-1-stage-b`, clean entry6975b3d. Target stacked PR base `codex/nearby-v2.1-package1`.

## Checkpoint 0 — mapping and approved plan

Existing-behavior integration branch: retain requestId, resolver/search/pagination/history algorithms and contracts from PR #5; adapt rendering to the approved PR #9 layout. Installed Team Workflow, frontend-design-pipeline and frontend-design read; Issue/source design override free art direction. Keep color #087466/#08675c, white, light #f5f6f1 surfaces, weak separators, compact consistent type/spacing. No new framework/fonts/dependencies.

| Source | Target / action |
| --- | --- |
| PR #9 prototype search/summary and horizontal toolbar composition | Adapt into SearchApp's existing form/confirmed state, real categories/radius/buttons; no demo handlers |
| PR #9 workspace/mobile CSS | Selective rule adaptation in app/explore.css, approximately41:59 of actual shared-shell container; narrow tablet minimum adapted to its existing wider navigation |
| PR #5 shared AppShell/Sidebar | Keep code and non-Explore pages unchanged; no duplicate navigation or prototype shell bypass |
| PR #5 SearchApp requests/history/filter/sort/page helpers, PlaceList fields/AMap links | Retain contracts and logic, use real response fields in a clean vertical list; no fabricated photos/bookmarks |
| Existing ExploreDialog | Reuse for candidates and persistent conditions; preserve keyboard/Escape/focus |
| PR #9 static geographic map | Do not copy fake roads/area labels. Dedicated transparent non-geographic schematic of confirmed center/radius, explicitly not a map or geographic scale |
| Prototype route/demo fixtures/instructions/screenshots | Do not migrate |
| test/browser/explore.spec.ts and shell.spec.ts | Preserve behavioral regressions, adapt only selectors/assertions affected by approved layout; new B1 layout/geometry evidence |
| UX #6 | Separate B2 commit and test/browser/refine-location.spec.ts; prompt in candidate-dialog bottom/not-found, original input focus/caret/helper lifecycle, explicit confirmation for new confirmed responses, preserved history replay |

Map inspection: only AMAP_WEB_SERVICE_KEY in server boundary and .env.example; no browser SDK/package/NEXT_PUBLIC map key or security config. Control-console key application type/domain whitelist and Preview JS credentials unknown; do not open env secret values or change settings. No safe preconfigured real map integration established. Use permitted marked non-realtime/non-geographic state; propose a separate pre-release map task with SDK credentials/domain readiness, real GCJ-02 center/metre-radius circle and responsive resize tests. No merchant markers/linkage.

## Checkpoints and acceptance

1. B1: real /explore search layout, candidate dialog, category/radius toolbar, real result/filter/sort/load-more/history. No UX #6 behavior change yet. Build and run existing Node/browser checks; capture formal-route before/after desktop/tablet/phone plus breakpoints. Commit separately only when regression gate passes.
2. B2: minimal refinement state and handlers, no API changes; new resolver confirmed response becomes one clickable candidate, never automatic center/search. Candidate/not-found hint closes dialog, retains query, caret end/focus and visible helper; stale/new query responses invalid, helper clears on new candidate success/clear/confirm/history. Preserve saved confirmed-coordinate replay directly. Dedicated behavioral tests including delayed responses, repeated refinement, mobile/keyboard and zero nearby request before explicit action. Independent commit.
3. Final review/verification: lint/types/Node/full browser/production build against final code; actual1440×900,820×1180,390×844 screenshots,768/820/1024/1279/1280/1440 bounds; scope/code and screenshot self-review, disclose evidence source fixtures vs live services. New PR with two checklists, modified files, limitations, stacked CI not triggered and actual Preview status. No master merge/production/automatic Issue closure. Stop for human review.

Existing shared shell is208px desktop/180px narrow tablet, not prototype220/72. Preserve that mandated shell rather than redesign it; workspace percentage drives ratios, with a240px minimum for the narrower available tablet area. Stage A fake map/merchant fixtures are not accepted as a real map solution. Browser evidence uses the real production UI with controlled API/provider/DB boundaries, never calls external provider or real DB.

## Checkpoint 1 result

B1 PASS: lint, core/web types,103/103 Node tests, full production build and18/18 browser tests40.1s (14 existing+4 layout cases), zero skipped/flaky. All3 formal-route screenshots opened/self-reviewed, actual baseline before captures from PR #5 at6975b3d. Workspace1440:500/732 in1232px shared-shell content (40.58%);820:262.39/377.61;390 map above42%-height expanded list. Six specified breakpoint bounds pass, keyboard dialogs and actual search/history/page2 regression pass. Core/API/history/store/schema/Shell unchanged. One new presentational map-state component and scoped CSS; no fake roads/results/bookmarks. Non-geographic circle has a fixed schematic size and the actual radius text, expressly no geographic scale/projection.

First browser run16/18 exposed history button's unintended form-submit after moving it into the input; explicit type=button fixed it, full18 rerun passed. Batched screenshot corrections fixed radius-label wrapping, filter layout and row density; final screenshots regenerated and viewed. Evidence `issue-10-evidence/{before,b1,b1-regression}` and B1 browser-summary. B1 contains no UX #6 behavior change; next permitted action is separate B2 implementation/commit. Existing navigation reference discontinuity remains a non-blocking design observation; this formal route retains PR #5's different shared-shell breakpoints, no navigation refactor.

## Checkpoint 2 result

B1 independently committed2eb9253 before B2. B2 adds one refinement boolean, original-input focus/caret handler and helper lifecycle, candidate-dialog footer/not-found entry. Fresh resolver confirmed responses become one clickable candidate; only confirmCandidate locks a new center. Saved-history replay remains direct. Existing requestId invalidation handles edits/new requests; no protocol/backend changes. Dedicated `refine-location.spec.ts`6 cases cover desktop/mobile repeated refinement/query text, more candidates, caret/helper/keyboard, not-found/clear/empty validation, fresh confirmed address without automatic search, out-of-order and edited-input stale replies, and direct history replay. Fixture candidateLabel is test-only.

Final B2 verification: lint/types/build PASS,103/103 Node tests PASS, full24/24 browser tests48.8s (14 legacy+4 layout+6 UX), zero skipped/flaky. First type check caught untyped locator input selection properties, corrected the test's HTMLInputElement cast before full successful rerun. Actual candidates/helper mobile and three final formal-page screenshots opened and inspected; header/sidebar and business data remain from PR #5, no Stage A fixtures. Evidence `issue-10-evidence/ux6/browser-summary.json` and UX screenshots. B2 will be committed separately; next checkpoint is final review/evidence/stacked PR, no new business scope.
