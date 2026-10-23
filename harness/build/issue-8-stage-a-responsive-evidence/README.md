# Stage A — progressive workspace columns

Authority: [latest PR #9 visual review](https://github.com/JKd121/nearby-places/pull/9#issuecomment-6357164853), the user's instruction to read and follow latest feedback, and Issue #8 (updated2026-10-22T18:58:08Z). This follow-up accepts the previous1440/820/390 captures and specifically requests a progressive medium-width results column. It does not authorize Stage B. Entry: clean `codex/nearby-explore-prototype` at a865ab3, equal to PR head and remote.

## Runtime change

Only `app/prototype/explore/prototype.css`: replace the fixed desktop500px track with `clamp(300px, 41%, 500px)` and remove the medium-width fixed300px override. The percentage resolves against the actual workspace container, after the navigation width. Phone uses the existing flex layout, so the grid-track declaration has no effect there. No navigation, search/toolbar, palette, font, border, row component, map/marker/circle or formal business logic changes. Added dependencies:0.

## Actual Chromium measurements and screenshots

| Viewport | Navigation | Workspace | List | Map | List share |
| --- | ---: | ---: | ---: | ---: | ---: |
| 768×900 | 72 | 696 | 300 | 396 | 43.10% (minimum) |
| 820×1180 | 72 | 748 | 306.67 | 441.33 | 41.00% |
| 1024×900 | 72 | 952 | 390.31 | 561.69 | 41.00% |
| 1180×900 | 72 | 1108 | 454.27 | 653.73 | 41.00% |
| 1279×900 | 72 | 1207 | 494.86 | 712.14 | 41.00% |
| 1280×900 | 220 | 1060 | 434.59 | 625.41 | 41.00% |
| 1440×900 | 220 | 1220 | 500 | 720 | 40.98% (maximum) |

[Desktop1440](desktop.png), [tablet820](tablet.png), [phone390](mobile.png), [1024](viewport-1024.png), [1279](viewport-1279.png), [768](viewport-768.png), [1180](viewport-1180.png), [1280](viewport-1280.png). All are actual running-page screenshots, opened and visually inspected. `breakpoints.json` includes exact rectangles, ratios and overflow flags; every tested width, plus767×844 and390×844, has no document overflow. Category-strip scrolling and intentional result-list scrolling remain. Narrow tablet remains usable; its list grows only6.67px from the previous300px. At1024/1279 the list text has more space, without font enlargement or added borders. No independent visual approval is claimed.

Exact screenshot equality against the previous a865ab3 evidence: full1440 desktop SHA256 `AF513D3B92AF079E57A1F3408C56A9C4D01302CC16C6BE2304696BECF7D39E2D`; full390 phone `F0169FDA30F30830C19D7765434334A739E42395EA976F44E66BEA14C132661F`. Desktop top250px before/after equality: `76B6B30211B5F1F6EDFDA8BED1D6DC44B17C7CE37CBC68BDB74BD1FF52ACC298`. Previous evidence folders remain untouched. `before-1024.png`, `before-1279.png` and `before-geometry.json` capture this revision's actual baseline.

## Remaining navigation discontinuity — disclosed, not silently fixed

The existing navigation expands72→220px at1280, removing147px of workspace despite a1px wider viewport. Therefore list494.86→434.59 and map712.14→625.41 still shrink at that boundary. Their ratio now remains41/59 instead of the previous25/75→47/53 jump, but absolute geometry is not continuous. At1280 the unchanged top confirmed-place text ellipsis and category-strip scrolling also remain; there is no new overflow. This is not reported as a fully smooth breakpoint.

Smallest proposed next remedy, **not implemented or approved here**: keep the existing nav components and interactions; interpolate only its CSS width72→220 over1280–1428px (e.g. `clamp(72px, calc(100vw - 1208px), 220px)` in that band), retain compact icon/hidden-label styles until the full width is available, and leave top search/toolbar breakpoints independent. At1440 navigation stays220 and workspace500/720. This would need product-owner confirmation of the intermediate navigation appearance, then actual rendering/focus/overflow verification. No new navigation component, toggle or broad refactor is proposed. For this revision, navigation is deliberately unchanged as the review requests a proposal before expanding that work.

## Verification executed against the final code

- `npm run lint`: PASS, zero warnings.
- `npm run check`: PASS, core/web TypeScript.
- Next production webpack build: PASS,11 routes. CI localhost placeholder database URLs were passed only to its child process; no environment files, persistent settings, real DB calls or migrations.
- `npm run test:browser -- test/browser/prototype.spec.ts`: PASS4/4 in13.9s, zero flaky/skipped. Final embedded report summary: `browser-summary.json`.
- Three-view interactions verify demo categories/radius, dialog focus, selection, memory-only bookmarks/reset, mobile navigation/list expansion, no page errors and zero business API requests. Breakpoint test verifies progressive medium-width list growth, target ratios, one center/circle, container fill and viewport-safe search/radius controls. The residual navigation jump is measured, not hidden by a continuity assertion.
- Diff self-review: two CSS lines changed/removed; tests and phase/evidence documents only. No second design direction, business API/schema/history changes, dependencies or deployment configuration edits.
- First type/build attempt failed because the test measurement array was read before TypeScript could infer its element type. Replaced that look-back with a numeric previous-width variable, then reran lint/types/build and browser verification successfully. Historical103 Node/17 browser baseline results were not rerun this revision.

Route `http://127.0.0.1:3190/prototype/explore`; development start `npm run dev -- --port 3190 --hostname 127.0.0.1`. Existing production build can be viewed with `node node_modules/next/dist/bin/next start -p 3190 --hostname 127.0.0.1`. Six clearly labeled demo places and a static illustrative map remain; exactly one center marker/range circle, no merchant markers or live map service.

Same draft PR #9 against `design/nearby-explore-v2-reference`; see PR for current pushed commit/Preview status. Existing GitHub Actions are master-only, so this PR does not trigger them; absence is not a pass. Preview protection unchanged. Stop at Stage A and await visual review; no merge or production deployment.
