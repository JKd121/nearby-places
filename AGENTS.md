# Project Agent Instructions

- 当前项目是地点周边生活服务聚合器全栈 Web 应用，使用 Node.js、TypeScript、Next.js App Router、React，以及 Prisma / PostgreSQL 历史记录存储；保留高德 Web Service API 的 CLI 调研脚本。
- 主要入口：`app/` 页面与 API Route、`src/` 业务与传输模块、`prisma/` 数据模型、`test/` 测试；当前任务与历史证据入口为 `PLANS.md` 和 `harness/`。
- 任务分支按用户要求使用 `Nearby-任务目的[-已有版本或阶段]`，任务目的优先中文，不再添加 `codex/` 等前缀；版本只沿用有依据的既有版本，`master` 保留为默认主分支。关联未合并 PR 的改名需同时处理其引用与影响；本次整理结果及旧名对应关系见 `PLANS.md`、`harness/build-log.md`。
- 文档分工：`README.md` 维护功能、运行方式和代码地图；`PLANS.md` 顶部维护当前状态及待办；`test/README.md` 维护测试方法与覆盖边界；`harness/build-log.md` 和 `harness/build/` 保存历史决策和证据。接续任务先核对当前分支、实际代码和相关历史，不将旧快照当成现状或本轮授权。
- UI 已是现有产品的一部分；新增功能或基础设施仍须在已批准的阶段范围内，不因旧 Spike 描述或历史授权扩大本轮任务。
- 常规验证：`npm test`（包含 AST 高德出口门禁、编译及 Node.js 测试）、`npm run check`（核心与 Web 类型检查）、`npm run build`（核心与 Next.js 构建）。CI 在面向 master 的 PR 及 master 推送时运行这些检查，使用 Node.js 24。
- `npm run smoke` 会执行真实高德 API 调用并消耗额度，不属于隔离验证；应遵守当前任务的授权与环境限制。测试、类型检查和构建也会产生生成文件，严格只读任务不应运行这些命令。
- 保留请求安全基线、统一高德传输出口和安全错误协议；验证通过不等于真实 Vercel 断连已完成端到端验收。候选运行参数、验收证据及仍有效的阶段约束见 `PLANS.md`，不得自动推进后续阶段。
- 功能、API、环境变量、命令或测试入口变化时，同步对应文档；只更新受影响内容，历史报告以带日期的补充说明纠正。`prisma7.config.ts` 是非默认配置名，Prisma CLI 显式使用 `--config prisma7.config.ts`；运行连接读取 `DATABASE_URL`，CLI 连接读取 `DIRECT_URL`。
- 本地验证、浏览器夹具、CI、Preview、生产冒烟和真实端到端证据分别报告；测试数量和部署状态注明对应日期/版本，不把旧结果当作本轮通过。提交、推送、合并和部署按用户明确授权执行。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
