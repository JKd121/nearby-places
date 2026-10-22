# Issue #8 Stage A — runnable SVG-led prototype

## Authority and safety

Only Stage A is authorized. Issue #8 updated 2026-10-22T18:23:46Z, no comments at entry. User requested the prototype, three browser viewports and optional safe independent preview, then explicitly authorized switching workspaces. Original checkout was dirty on history-confirmed-location/16503c1; PR #5 worktree was clean on nearby-v2.1-package1/6975b3d. Neither is an edit target.

Fetched only the two explicit remote refs. Native worktree creation produced a clean detached checkout at c46fac4, then attached the existing matching local/tracking prototype branch. Final entry path `C:\Users\lenovo\.codex\worktrees\nearby-explore-prototype\地点聚合器`, branch `codex/nearby-explore-prototype`, HEAD c46fac4452cb6cceab0d2edf88350302e733c7ee; index/worktree clean. Reference and prototype remote refs match this SHA; SVG working blob and design branch blob both af7d2ff764c1645061950df38d7808ac54dd25f6.

## Plan and visual contract

State STAGE_A_READY_FOR_VISUAL_REVIEW. Existing stack: Next16.3.3, React19.2, Tailwind4.3.3, adapted shadcn Button/Sidebar, Radix and Lucide. Read installed frontend-design and Team Workflow instructions, project Harness, relevant installed Next layouts/pages documentation. Viewed actual reference SVG through a localhost-only static server in Chrome before coding. The brief overrides free art direction: no alternate design tournament, fonts/CDN/frameworks or decorative assets.

- KEEP: desktop sidebar220, header64, search92, single toolbar94, vertical list440, remaining map780×650 at1440×900. Search input + parse + compact confirmed summary + edit remain co-present. Brand #087466/#08675c, white, sidebar#fafaf8, map#f5f6f1, separators#eceeea, selected-row#eff6f3. System fallback of reference Inter/Noto Sans SC/Microsoft YaHei; body14–16px, heading21px, aligned30px gutters.
- ADAPT: real React controls and accessible focus/labels; existing category keys only (reference coffee/bookstore examples are replaced by bakery/mall, no business definition changes). Truthful demo count. Explicit illustration/demo disclosures. Local-only category/radius/sort/favorite-presentation controls, never real API calls or persistence.
- RESPONSIVE: tablet uses a72px navigation rail, a300px list and dominant remaining map; toolbar category strip scrolls independently. Phone uses mobile navigation, compact two-stage search/summary, horizontally scrollable categories plus radius/search row, map above an expandable bottom list. Never shrink the entire desktop SVG into a picture.
- MAP: SVG-derived static geographic illustration with attribution to the approved reference; one center pin and one translucent dashed range circle. Circle/label reflects selected radius as an illustration, no geographic measurement guarantee; no result markers or point/list linkage. No real SDK/network tiles/keys.
- DO NOT COPY: reference's fictional result count or example businesses as live API data; entire SVG as the page. Map example geography is illustrative, never live AMap. No Stage B, backend/auth/favorites service/schema/CI trigger/config changes.

Implementation: isolated `/prototype/explore` route with scoped CSS and a prototype component. A narrowly scoped shared-shell bypass for this route prevents duplicate navigation; ordinary routes remain unchanged. Reuse Button, Radix dialog and Lucide. Locked dependency install with no new packages; no environment files/credentials. Prototype requires no business environment configuration to run.

## Verification and preview plan

Run baseline103 tests, lint/type checks/build and prototype-specific Playwright tests/screenshots at1440×900,820×1180,390×844. Assert no API requests, one map pin/circle, horizontal controls/focus, local demo state, responsive bounds, no page errors and SVG proportion coordinates. Inspect all three actual screenshots against browser-rendered reference; batch material fixes once and confirm. Compilation is not visual approval. Existing business browser tests can run with their isolated fixture, with screenshot output redirected to preserve historical evidence.

Existing CI triggers only PRs to master/pushes to master. Do not change it or open a broad prototype PR to master. If preview needs a PR, target `design/nearby-explore-v2-reference` so its diff contains only Stage A, mark draft/do not merge. Existing Vercel branch preview may be available after pushing prototype branch; never change protection/settings. No Issue auto-close keywords. Stop at visual-review handoff, Stage B remains unapproved.

## Results

Implemented isolated route and actual responsive controls/static illustration; no Stage B. Final production build (Next webpack child process with CI placeholders), lint and core/web type checks PASS; baseline existing Node tests103/103 PASS. Final browser suite17/17 PASS43.5s (3 prototype +14 unchanged regression cases),0 skipped/flaky. Prototype tests observe zero API requests; radius label and diameter update consistently, selected rows do not create map markers, bookmarks are memory only. Pixel geometry at1440 exactly matches sidebar/list/map and main y250; all three viewport screenshots opened and self-reviewed against browser-rendered SVG. See `issue-8-stage-a-evidence/README.md`, geometry JSONs, browser-summary and verification manifest. No independent or product-owner visual acceptance is claimed.

Correction history: initial Prisma generation failed without DIRECT_URL; setup completed using only existing CI localhost placeholder in a child process, no real DB or config changes. First prototype browser run failed due a whitespace-sensitive candidate locator; corrected. First full run16/17 exposed missing mobile Dialog focus restoration; explicit trigger refs added for mobile navigation and category dialogs. Full rerun17/17 passed. Batched visual corrections aligned toolbar range separator and list top spacing with SVG, retained tablet distances, then final three captures were reviewed; no further free redesign.

No new dependencies, package/lock changes, credentials/env files, real provider/DB calls, schema/migrations, production API/search/history/algorithms or CI trigger changes. Original checkout retains branch16503c1/dirty PLANS/untracked Preview evidence; PR #5 worktree remains clean at6975b3d. Visual evaluation is awaiting product owner. Deliver prototype draft against reference branch; remote CI/Preview observations belong to that PR. Stage B remains unapproved.
