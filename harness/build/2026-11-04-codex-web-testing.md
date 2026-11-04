# Codex 协作与 Web 测试 — 2026-11-04

基线 `dc7c7e6bc9662d55da44453bf79cd089b1c353b3`，分支 `Nearby-Codex协作与自动回归`，本地未提交补丁。复用 `time-failure-pr` 中原干净工作区；其他工作区保留原状。

## 交付行为

- 新增 docs/codex-workflow.md，补充 AGENTS、维护指南、PR 模板和测试说明：需求例子、职责、验证选择与验收证据。
- Playwright Test 1.64.1 锁定为开发依赖，Chromium 自动启动真实 Next 生产构建；浏览器 API 在导航前接管，未知 API 和外部页面请求失败。项目 API 和业务源码保持原样。
- 历史集成仅从 NEARBY_HISTORY_TEST_DATABASE_URL 选择受限 loopback 测试库，自动建库并应用真实迁移，真实 Next Route／Prisma／PostgreSQL；API 及 SQL 分别核验读写与隔离，浏览器验证刷新回放和删除。
- CI 同一 verify job 顺序执行两层 Web 测试，并上传 HTML／失败截图／trace，保留 7 天；production 继续依赖 verify。
- 默认 Node 测试根据源码发现文件，排除独立准入套件。新增测试库 URL 保护用例。
- 无环境变量的 npm ci 首次发现 Prisma config 要求 DIRECT_URL。新增独立生成脚本，显式配置路径，在生成子进程提供占位 URL，重装通过。

## 前次实现的本地执行结果

| 命令／场景 | 实际结果 |
| --- | --- |
| npm ci，进程未设置 DATABASE_URL／DIRECT_URL | 成功；锁文件安装 188 个包，Prisma 客户端生成成功 |
| npm test | 243 核心／Route + 24 .mjs（19 AST、4 部署、1 测试目标保护），全部通过 |
| npm run check | 成功，包含 Web 测试 TypeScript |
| npm run build | 成功，恢复后的生产构建 |
| npm run test:admission:postgres | 35/35，通过独立本地测试库 |
| npm run test:browser | 9/9，零重试，约 8.5 秒 |
| npm run test:history:integration | 4/4，约 5.2 秒，全新库建库及 5 个迁移成功 |
| git diff --check | 成功 |

环境：Windows、Node.js 24.19.0、npm 11.17.0、PostgreSQL 18.4、Playwright 1.64.1／Chromium 1248。数据库服务为本轮新建的 loopback 55441 临时实例；历史与准入使用各自独立库。全新历史库中的当前测试访客数据由 afterEach 清理。

## 回归有效性对照

临时将 SearchApp 第二页合并结果替换为原 response，构建成功后定向运行“分页失败保留首批结果，重试追加第二页”。测试退出 1，具体因重试成功后找不到“合成hotel地点26”而失败，产生 HTML、失败截图、上下文和 trace。随后逐字节恢复 SearchApp 源码，重新构建并运行完整浏览器／历史套件，均通过。最终 src、app、prisma 没有差异。

首次迟到响应测试重复填写相同文本，未触发输入改变，导致解析按钮仍禁用；修正为先输入新值以取消旧请求，再发起新搜索，已通过。该失败属于测试操作修正。

## 证据与待办

本地日志：install-workflow.log、test-workflow.log、check-workflow.log、build-workflow.log、postgres-workflow.log、browser-workflow.log、history-workflow.log（均已忽略）。Web 报告位于 playwright-report/，失败产物位于 test-results/。聊天 outputs 提供指南、结果和可移植证据包，包含故障对照产物与源码补丁。

本轮真实高德调用 0 次；远端 CI／PostgreSQL 17、Preview、生产业务和 Vercel 断连验收尚待相应发布阶段。本地补丁未提交、推送或发布。npm 安装审计报告 8 项依赖漏洞（1 moderate、6 high、1 critical），本轮仅记录输出，依赖升级留作独立维护。


## 2026-11-04 接续：接口模拟和验收证据

沿用同一基线与分支，保留既有未提交实现；原 Documents 工作区单独计算文件哈希核对。产品 API、业务源码、数据库迁移保持基线内容。

- `test:api` 自动发现 Route 套件，复用真实 Route 与传输／准入／历史服务替身；新增解析成功及空、搜索部分成功及空、无效输入零发送、历史写入失败只尝试一次。预加载器禁止真实 fetch 和 TCP，另有隔离器自检。
- 浏览器新增空结果和未知 API／错误方法／外部请求拦截验证，共 11 场景。请求监听覆盖测试覆盖器发起的取消请求；业务场景附加合成请求、未处理异常列表和最终状态截图。机器可读 JSON、HTML、失败截图和 trace 随运行生成。
- `test:acceptance` 依次构建、接口模拟、浏览器回归；构建使用子进程本地占位配置。报告记录 HEAD、dirty、源码 SHA256、命令、退出码和时间；Playwright 启动前核对构建指纹，过期构建失败。定向运行参数转发给对应执行器。
- CI 的原 verify 必需检查内顺序运行接口、浏览器和历史集成；production 继续依赖 verify。Artifact `web-test-evidence` 保留 7 天，成功和失败均上传已生成产物。工作流经 actionlint 静态验证；远端执行待提交。

本轮执行：`npm ci` 成功；`npm test` 248 核心／Route +25 mjs 通过；独立 API 47 通过；浏览器 11 通过；历史 HTTP／PostgreSQL 4 通过；准入 PostgreSQL 35 通过；类型检查与构建通过。最终重新执行结果和源码指纹保存在 `test-results/evidence/`，终端日志为 `*-acceptance.log`、`acceptance-final.log`、`tests-final.log`、`history-final.log`。默认测试与单独 API 套件存在有意复用的场景，数量分项报告。

本地使用新建的 loopback 55442 PostgreSQL 18.4 临时实例，两个专用测试库。历史集成应用真实迁移，afterEach 清理测试访客行；验证后停止本轮实例。真实高德调用 0 次。当前交付仅在本地，未提交、推送、合并或部署。

### 本轮故障对照

1. 将 `src/server/http.ts` 中请求体超限的 413 暂时映射为 418，接口测试退出 1，三个 Route 的 413 断言失败。报告保存在 `test-results/mutations/api/`。
2. 将 `src/web/SearchApp.tsx` 的分页追加结果暂时替换为旧 response，重新构建，定向分页测试退出 1，缺少第二页第 26 条结果；保存 HTML、JSON、截图和 trace 到 `test-results/mutations/browser/`。
3. 两处源码均在 finally 中按原始字节恢复，前后 SHA256 一致；记录为 `test-results/mutations/checks.json`。随后用恢复后的源码重新构建并复跑。
4. 旧生产构建与当前源码不符时，浏览器入口退出 1，并提示重新构建；证据为 `test-results/mutations/stale-build/`。

汇总入口：`test-results/验收证据.md`。本地所有报告被 Git 忽略，业务源码无差异；工作流、测试及相关文档作为同一组本地交付。


## 2026-11-04：进入 GitHub 交付

用户确认审查通过并授权完成后续提交、推送、PR、合并与发布。上方“本地未提交”等状态保留为当次验证快照；本轮源码与测试提交的远端 CI、Preview、合并 SHA、生产验证及 Release 链接随交付归档到对应 PR。当前状态摘要已更新到 PLANS 顶部。
