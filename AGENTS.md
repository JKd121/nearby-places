# Project Agent Instructions

- Apply the Global Team Workflow to non-trivial software changes in this repository.
- Current authorized scope: GitHub Issue #7, iterating PR #5 on its existing branch. Use Issue #7 as the sole current task specification; Issue #4 and the original CLI Spike are historical context.
- Preserve the Next.js App Router / React / TypeScript search and history core. Complete Explore interaction restructuring before visual refinement; follow the scope and evidence record in `harness/build/2026-10-23-issue-7-explore.md`.
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
