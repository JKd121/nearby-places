# Project Agent Instructions

- Apply the Global Team Workflow to non-trivial software changes in this repository.
- Current authorized scope: GitHub Issue #8 Stage A only, on `codex/nearby-explore-prototype`. The approved SVG `docs/design/nearby-explore-v2-reference.svg` at c46fac4 is the sole visual standard; no free redesign.
- Build an isolated runnable prototype at `/prototype/explore`; preserve all existing business routes and search/history logic. Use explicit demo data and an illustrative map with exactly one center marker and one range circle, no merchant markers/linkage. Stage B requires explicit product-owner visual approval.
- No real map SDK, authentication, favorites/list backend, schema/migrations, production config, CI/Preview trigger changes, master merge or production deployment in this phase.
- Work only in the prototype worktree and branch. Do not modify PR #5's branch, the original checkout or their environment files.
- Keep historical Harness evidence. Old deployment instructions are historical authorization, not current actions.
- Known verification commands: `npm test`, `npm run check`, `npm run build`, and `npm run smoke`.
- UI verification: `npm run lint`, `npm run test:browser` after build (local Chrome, isolated memory DB/synthetic provider). Capture desktop/mobile/tablet evidence. Real-provider smoke requires separate environment readiness and is not a substitute for browser evidence.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
