# Project Agent Instructions

- Apply the Global Team Workflow to non-trivial software changes in this repository.
- Current authorized scope: GitHub Issue #4, Nearby V2.1 Package 1A. Use that Issue as the sole task specification; the original CLI Spike is historical context.
- Preserve the Next.js App Router / React / TypeScript search and history core. This phase adds the shared shell and four routes with Tailwind v4 and narrowly adapted shadcn/ui primitives.
- No real map SDK, authentication, favorites/list backend, schema/migrations, production config, CI/Preview trigger changes, master merge or production deployment in this phase.
- Work only in the Issue's designated worktree and branch. Do not modify the original checkout or consume its environment files.
- Keep historical Harness evidence. Old deployment instructions are historical authorization, not current actions.
- Known verification commands: `npm test`, `npm run check`, `npm run build`, and `npm run smoke`.
- UI verification: `npm run test:browser` after build (local Chrome, isolated memory DB/synthetic provider). There is no lint script. Real-provider smoke requires separate environment readiness and is not a substitute for browser evidence.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
