# 项目状态与待办

## 分类结果 Preview 用户验收通过（2026-11-04）

- 基于最新主线18230cf与本轮分类流式补丁发布[Preview](https://nearby-places-ftx9m8ic2-jk-d.vercel.app)，状态Ready，沿用Vercel登录保护。
- 47项API、14项浏览器验收及构建、类型检查通过；线上有认证检查首页200、无效搜索400。真实高德调用0次。
- 用户已确认本轮Preview“审核通过”；交付和证据见[Preview记录](harness/build/2026-11-04-category-preview.md)。当前工作树保留供后续交付，正在按用户“进行下一步”的授权提交PR、核对CI及发布生产。


## Codex 协作与自动回归（2026-11-04）

- 基于 master `dc7c7e6` 交付 Playwright Chromium、真实 Route 接口模拟、历史 HTTP／Prisma／PostgreSQL 集成及协作指南。日常运行 `npm run test:acceptance`，单独接口运行 `npm run test:api`。
- 浏览器 11 场景覆盖候选、条件、排序、空结果、失败、分页、取消／迟到、历史、手机键盘，以及请求隔离门禁；接口模拟 47 场景复用真实 Route，验证协议与副作用，拦截真实网络。
- 本轮本地验证：248 核心／Route +25 mjs、35 准入 PostgreSQL、11 浏览器、4 历史集成、check/build 通过。Node.js 24.19.0、PostgreSQL 18.4；CI 使用 PostgreSQL 17 临时服务，并在同一必需检查内执行新增套件。
- 报告包括 HTML、JSON、请求、截图、失败 trace、HEAD 和源码指纹。错误状态码及分页故障注入均被测试捕获，源码逐字节恢复；过期构建会阻止浏览器验收。真实高德调用 0 次。
- 单元测试自动发现源码；无 DIRECT_URL 时的安装生成使用子进程占位配置。原 Documents 工作区保持原样。
- 本轮审查已获用户确认，远端 CI、Preview、主线合并和发布证据归档到对应 PR 与 [Releases](https://github.com/JKd121/nearby-places/releases)。实施及本地结果见 [本轮记录](harness/build/2026-11-04-codex-web-testing.md)。

## 业务发布基线（2026-11-03 核对）

- 业务基线：`1d778f9342cc84c3a84f9dd59052e35f5c5fe965`，PR #32 已于 2026-10-29 合并；包含数据库异常恢复、连接收尾与最多两类并行搜索。
- 对应该提交的 PR CI／master CI 成功，Vercel Production 状态成功；PR #32 记录首页 200 和无效搜索 400。此处为既有发布证据，本轮另行记录新的核验。
- 上次准确提交验证：243 项核心／Route、19 项 AST、35 项临时 PostgreSQL 集成，以及 check/build。性能 45.75% 改善来自 300ms 数据库 RTT＋2s 模拟 HTTP 的三轮本地对照。
- 最新版本的完整真实高德生产验收和 Vercel 断连验收仍待完成，跟进 [Issue #24](https://github.com/JKd121/nearby-places/issues/24)。

## 维护交付

- [PR #33](https://github.com/JKd121/nearby-places/pull/33)：维护指南、Issue／PR 模板、文档同步、历史整理和 CI 成功后的生产发布。
- Vercel 项目身份及 GitHub Production 三个 secrets 名称已核对，生产任务的实际运行结果随本轮交付记录更新。
- 公开前审查已覆盖 Git 历史、讨论、Actions 和图片；仓库已公开，master 强制 PR／CI／最新基线／讨论解决及管理员约束已启用。
- PR CI 已通过四类检查；Preview READY，经认证核验首页 200、无效搜索 400。失败门禁夹具 #34 已验证 CI 失败时主线合并受阻、生产任务跳过，并已关闭清理。
- 最新维护合并、生产结果及发布索引见 [PR #33](https://github.com/JKd121/nearby-places/pull/33) 和 [Releases](https://github.com/JKd121/nearby-places/releases)。
- 本轮交付与历史整理清单：[维护记录](harness/build/2026-11-03-github-maintenance.md)。

## 产品及工程待办

- [#6](https://github.com/JKd121/nearby-places/issues/6)：补充地点信息入口及地址解析后的用户确认交互尚有缺项，保留开放。
- [#14](https://github.com/JKd121/nearby-places/issues/14)：请求级诊断、会话关联和导出仍有独立价值；已有准入失败诊断见 PR #31。
- [#17](https://github.com/JKd121/nearby-places/issues/17)：额度／共享速率已落地，公平性、滥用治理和协议研究继续跟进。
- [#24](https://github.com/JKd121/nearby-places/issues/24)：补齐真实生产验收和仍有效的根因调查。
- 旧方案、草稿及实验逐项处置见本轮维护记录；当前代码入口见 README，维护约定见 CONTRIBUTING。

## 历史记录

整理前 PLANS 原文完整保存于 [2026-11-03 归档](harness/build/2026-11-03-plans-history.md)。按日期的决策、参数和测试结果继续保存在 [build-log](harness/build-log.md) 及 [build](harness/build/)；当前摘要随对应发布更新。
