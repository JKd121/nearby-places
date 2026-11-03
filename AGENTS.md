# Project Agent Instructions

- 当前项目是 Node.js 24、TypeScript、Next.js App Router、React、Prisma / PostgreSQL 全栈地点服务应用。
- 开始任务先核对工作区、分支、HEAD、实际代码和相关 Issue／PR，保留已有修改；任务分支使用 Nearby-任务目的[-已有版本或阶段]，默认主线 master。
- 日常 Issue、提交、PR、审查、合并、发布及文档更新遵循 [CONTRIBUTING.md](CONTRIBUTING.md)，按用户当前授权执行外部操作。
- README 维护使用和代码入口，PLANS 顶部维护当前状态，test/README 维护测试方法，harness 保留带日期的证据。
- 常规验证 npm test、npm run check、npm run build；CI 另执行独立 PostgreSQL 集成。真实高德 smoke 使用单独批准的范围和预算。
- 保留统一高德出口、请求安全和额度账本。Prisma CLI 显式使用 --config prisma7.config.ts，运行连接读取 DATABASE_URL，CLI 连接读取 DIRECT_URL。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
