# Stage A — desktop width revision

Authority: [PR #9 visual review](https://github.com/JKd121/nearby-places/pull/9#issuecomment-6348830035), Issue #8 supplement updated 2026-10-22T18:58:08Z, and the user's width-only instruction. Entry: clean `codex/nearby-explore-prototype` at 490c7d6, equal to remote. Stage B remains unapproved.

## Change and visual inspection

The only runtime change is `.proto-workspace` in `app/prototype/explore/prototype.css`: desktop list column 440px → 500px. At 1440×900, browser measurements are list500/map720 (previously440/780), sidebar220, workspace y250/height650. Existing flexible row text receives the extra width; font sizes, row styling, controls, map illustration, center marker and range circle code are unchanged. No new card borders, dependencies, business changes or environment files.

Actual Chromium browser screenshots, opened and visually inspected after the passing test run:

- [Desktop 1440×900](desktop.png): wider text area, map remains dominant, unchanged toolbar/search and restrained boundaries.
- [Tablet 820×1180](tablet.png): existing72px navigation,300px list and448px map retained.
- [Phone 390×844](mobile.png): existing map-above-list layout and horizontal category scrolling retained.
- [Original desktop before this revision](../issue-8-stage-a-evidence/desktop.png); [browser-rendered reference](reference-desktop.png). The latest review deliberately overrides the reference's original list/map widths only.

Unchanged screenshot proof (SHA256, exact file equality):

| Area | Before and after SHA256 |
| --- | --- |
| Desktop top250px, captured immediately before and after revision | 76B6B30211B5F1F6EDFDA8BED1D6DC44B17C7CE37CBC68BDB74BD1FF52ACC298 |
| Tablet, original Stage A vs current capture | 4B3DFDD967CF6379613BDCE95DE470DA07A4F3CBD221FBFFCFD20B5445CAE668 |
| Phone, original Stage A vs current capture | F0169FDA30F30830C19D7765434334A739E42395EA976F44E66BEA14C132661F |

`before-top.png` and `after-top.png` are actual browser clip captures, not edited images. Full screenshots are actual running pages, not the reference SVG or generated imagery. The six places remain explicit demo data; the map remains an explicitly disclosed static illustration with one center marker and one radius circle, no merchant markers or business API calls.

## Verification executed for this revision

- `npm run lint`: PASS, zero warnings.
- `npm run check`: PASS (core and web TypeScript).
- Production Next webpack build: PASS,11 routes. Executed the existing Next CLI in a child process with the CI's localhost placeholder database URLs; no database calls, migrations or environment-file changes.
- `npm run test:browser -- test/browser/prototype.spec.ts`: PASS,4/4 in12.3s; zero skipped/flaky. See `browser-summary.json` extracted from the final Playwright HTML report.
- Three viewport tests cover demo controls, radius change, dialog focus, selection, memory-only favorites, mobile navigation/list expansion, reload reset, no page errors and zero business API requests.
- Added breakpoint coverage at767/768px and1279/1280px: no document overflow, search/radius controls stay within viewport, map/list ordering and300/500px list widths correct. Measurements in `breakpoints.json`; primary geometry in each `*-geometry.json`.
- Reviewed the diff: one runtime CSS value; tests and scope/evidence documentation only. No formal business regression rerun was needed for this isolated width change. The earlier103 Node tests and17 browser tests belong to the previous Stage A baseline, not this revision's executed results.

Local review: `http://127.0.0.1:3190/prototype/explore`. Start with `node node_modules/next/dist/bin/next start -p 3190 --hostname 127.0.0.1` after a production build, or `npm run dev -- -p 3190` for development.

PR #9 remains the independent draft against `design/nearby-explore-v2-reference`. Its GitHub Actions CI is not triggered by the existing master-only rules; do not interpret absence as a pass. Check the PR for deployment status after the new push. Preview protection and production settings are unchanged. Product-owner visual approval remains pending; stop here and do not enter Stage B.
