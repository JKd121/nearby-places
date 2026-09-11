# Project Agent Instructions

- Apply the Global Team Workflow to non-trivial software changes in this repository.
- Keep the current project as a minimal Node.js + TypeScript command-line Spike for validating the AMap Web Service API.
- Do not add product UI or unrelated infrastructure unless a later phase is explicitly approved.
- Known verification commands: `npm test`, `npm run check`, `npm run build`, and `npm run smoke`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
