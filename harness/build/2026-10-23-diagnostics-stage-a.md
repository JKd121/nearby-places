# Nearby Diagnostics v1 — Stage A

状态：IMPLEMENT。授权：2026-10-23 用户明确要求执行 Issue #14 Stage A，包括提交、Draft PR（base master）与 Preview；完成后暂停。Issue 是需求源：https://github.com/JKd121/nearby-places/issues/14 。

## 启动与目标

`git fetch origin` 成功；当前独立 Worktree `b368/地点聚合器` 初始 clean、detached HEAD，等于最新 origin/master `3bc08d4f7636b72c7206f1d9e4cb6272c212e41b`。无同名本地/远程分支；由该 SHA 创建 `perf/search-observability`。没有 cherry-pick、其他 PR 或未提交修改。旧 Harness 的历史发布状态已落后于已合并 Git 事实，本任务不继续旧任务。

目标：为解析→确认→周边搜索提供可关联、可脱敏导出的服务端分阶段耗时与错误证据。分支：缺失的观测能力；不声称性能改善或建立真实性能基线。

## 范围、方案、取舍

- 仅两条 POST 入口、其 resolver/provider/client/search 调用链，以及客户端无 UI 的会话请求头。
- server-only JSON logger / performance.now timer / request wrapper；核心 CLI 模块只依赖可选诊断接口，显式注入，避免服务端实现进入客户端或破坏 CLI。
- 固定字段白名单、事件/阶段词典；不输出异常全文、搜索词、坐标、上游 URL 或凭据。请求 ID 后端生成，会话头仅接受 UUID；无响应体/响应头变更。
- PERF_LOG_ENABLED 默认 off，开启才记录详细阶段；错误边界保留去重、规范化日志。沿用现有返回值、错误和恢复方式。
- 已检查 Pino 官方 API/redaction 文档与 pino-std-serializers/lib/err.js 实现（2026-10-23）：通用序列化默认包含 message/stack/可枚举字段，与本需求的敏感上游错误不匹配。借鉴结构化字段模式，采用小型白名单实现，无新增依赖、无复制外部源码。
- 已核对安装的 Next.js Route Handlers 文档；继续 nodejs POST，不加 middleware。
- 导出沿用 Vercel 手动导出；提供 Preview 采样与离线 JSONL 整理说明。官方平台文档与导出 changelog 已查询。

非目标：Stage B、算法/频率/次序/500ms 等待、结果 schema、UI、历史记录/数据库、生产配置、遥测外发、大规模真实 API 调用。

## 验收和验证计划

1. Mock fetch/fake delay：成功、HTTP/业务/JSON/网络失败，单类别与多类别 partial success；逐类调用与固定等待保持一致。
2. Logger/Timer/handler：默认关闭/显式开启、成功和同步抛出/异步拒绝、日志失败不影响业务、4xx/5xx 正常返回、异常、并发请求隔离、UUID 验证、凭据脱敏。
3. 两条实际 route 的 mock 集成：不改变 body/status/headers，geocode/POI/not_found，跨请求同 session 不同 request ID。
4. npm test / npm run check / npm run build / git diff --check；smoke 仅无 key 快速失败检查，不调用真实高德。
5. 同 Agent 需求与工程自审（未授权独立子 Agent）；提交/推送、Draft PR、检查 Vercel Preview 状态。可用时只做无上游调用的边界探针。

停止点：Stage A 交付后暂停；真实采样按 runbook 人工执行，Stage B 必须另行明确授权。实际结果将在此追加，计划不算通过证据。

调研来源：https://github.com/pinojs/pino/blob/main/docs/redaction.md 、https://github.com/pinojs/pino-std-serializers/blob/master/lib/err.js 、https://vercel.com/docs/logs/runtime 、https://vercel.com/changelog/improved-streaming-runtime-logs-exports 。

## REVIEW / VERIFY — 已执行

- 同一 Agent 自审，未使用独立审查 Agent。核对结果 schema/HTTP 映射不变、调用参数/次数/次序不变、500ms 仍位于原位置、无末项等待；未触及 UI JSX/样式、prisma/history、分页 API、类别配置或排序算法。没有新增依赖。
- 自审修正：统一错误按请求去重，避免 route catch 与正常返回 5xx 再报一次；JSON/上游业务错误在准确的内部计时阶段抛出，保留原始异常/响应契约；无第三方 message/stack 输出。修正后重新通过全部检查。
- 环境：Node v24.19.0、npm 11.17.0、Windows PowerShell；新 Worktree 无环境文件。首次 npm ci 的 postinstall 因缺少 DIRECT_URL 失败；使用当前进程占位 `postgresql://ci:ci@localhost:5432/nearby_ci` 后 `npx prisma generate` 成功，不建立数据库连接，不加载生产密钥。
- `npm test`：**116/116 PASS**（原有 103 + 新增 13）。实际覆盖两条 route、1/3/8 类别 fake delay、partial success、provider HTTP/JSON/业务/网络/读取/超时异常、计时值/错误传播、开关、脱敏、sink 故障、返回 4xx/5xx、并发 UUID、离线导出与拒绝覆盖。
- `npm run check`：PASS；`npm run build`：PASS（最终版本重新执行）；`git diff --check`：PASS。前端 `.next/static/chunks` 中未检出 server-only logger / PERF_LOG_ENABLED / diagnostics 实现。
- `npm run smoke`（删除进程 Key）：按预期 exit 1，Missing AMAP_WEB_SERVICE_KEY，验证 CLI 仍可加载且快速退出；不是实际高德集成通过。本轮真实高德调用为 0。
- 本地 mock route stdout 12 行已由离线 exporter 提取为 `harness/build/diagnostics-stage-a-mock.jsonl`；非真实性能基线。
- 实际 Chrome 交互：生产构建 UI + 编译后的两条真实 Route Handler，合成高德 fetch、stub history（不连接数据库）。输入地点→候选确认→只选 bakery→搜索→显示结果。2 条 POST 同 session、不同后端 requestId、两条 HTTP 200，24 条结构化日志。证据 `harness/build/diagnostics-stage-a-browser.json`。没有用此结果冒充远程高德或真实数据库证据。
- 已提供 `docs/diagnostics.md`：Preview 范围开关/重新部署、Chrome 与服务器计时区别、事件、人工小样本、Runtime Logs 筛选/导出、保留期/数量限制、离线 JSONL、故障排查。Preview 变量没有自动更改；远程开启后的真实日志/账户导出权限仍待人工验证。

## 远程交付与停止点

- 实现提交：`42d97923a11fc91b076e0a819a147428ba9ced6c`，已推送 `origin/perf/search-observability`。
- Draft PR：[#15](https://github.com/JKd121/nearby-places/pull/15)，base=master，保持 Draft，未标记 Ready、未合并。
- [Vercel Preview](https://nearby-places-git-perf-search-observability-jk-d.vercel.app) 已由 Git 集成触发，Vercel 状态 **success / Ready**；[部署详情](https://vercel.com/jk-d/nearby-places/657AkVWHSfEwZYaBWCSYxLWcdhUr)。
- GitHub [CI run 39964667516](https://github.com/JKd121/nearby-places/actions/runs/39964667516)：Tests, types and build **success**；安装、tests、check、build 均成功，基于实现提交 42d9792。
- 远程无上游探针：Preview 首页重定向 Vercel 登录页；两条 API 无效空请求均被平台保护拦截为 401，不进入业务 handler。没有更改访问保护；远程业务/真实日志/导出需有权限的人工登录会话验证。未执行真实高德采样，未验证本账户套餐/导出权限。
- 后续仅提交此交付记录和手册链接，不变更已验证实现。临时浏览器代理与本地 Next 测试进程已停止。

当前状态：**STAGE_A_DELIVERED — AWAITING_HUMAN_REVIEW**。Stage A 代码、测试、Draft PR 与 Preview 已交付；远程真实日志验收受上述访问/变量前提限制。暂停开发，等待人工诊断结果和 Stage B 明确授权。生产数据库/环境变量未读取或修改，未开展 Stage B。
