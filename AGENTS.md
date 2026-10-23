# Project Agent Instructions

- Apply the Global Team Workflow to non-trivial software changes in this repository.
- Current authority: GitHub Issue #10 Stage B only. Base is PR #5 at6975b3d; approved visual reference is PR #9 atcc88851. Use the independent Stage B worktree/branch, never merge the whole prototype branch.
- Preserve SearchApp API/search/history contracts and the shared Shell; selectively adapt approved Explore layout, then implement UX #6 in a separate commit with dedicated tests. Plan/evidence: `harness/build/2026-10-23-issue-10-stage-b.md`.
- No demo data/bookmarks or fake geographic roads in production UI. Map integration is deferred pending browser SDK/key/domain readiness; clearly label the non-geographic center/radius schematic. Existing navigation size discontinuity is non-blocking, not a reason to redesign navigation.
- No real map SDK, authentication, favorites/list backend, schema/migrations, production config, CI/Preview trigger changes, master merge or production deployment in this phase.
- Work only in the Issue's designated worktree and branch. Do not modify the original checkout or consume its environment files.
- Keep historical Harness evidence. Old deployment instructions are historical authorization, not current actions.
- Known verification commands: `npm test`, `npm run check`, `npm run build`, and `npm run smoke`.
- UI verification: `npm run lint`, `npm run test:browser` after build (local Chrome, isolated memory DB/synthetic provider). Capture desktop/mobile/tablet evidence. Real-provider smoke requires separate environment readiness and is not a substitute for browser evidence.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
