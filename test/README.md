# 测试与验证

## 当前执行入口（2026-11-04 整理）

使用 Node.js 24 和 npm ci。在仓库根目录运行 npm test、npm run check、npm run build。npm test 通过 test/run-unit.mjs 从 test/ 源码自动发现 .test.ts 和 .test.mjs；独立 admission-postgres.test.ts 保留专用入口。先编译，再按源码名单运行 dist，避免旧编译文件混入。测试使用受控替身，真实高德调用为 0。

构建需要有效格式的数据库环境；独立终端可设置 DATABASE_URL、DIRECT_URL 为 postgresql://ci:ci@localhost:5432/nearby_ci，仅供隔离检查。npm ci 的生成脚本会为缺失的 DIRECT_URL 提供仅作用于生成子进程的占位值；也可在准备环境后显式使用 npx prisma generate --config prisma7.config.ts。命令会写入 dist、.next 和类型缓存。

npm run test:admission:postgres 仅连接 NEARBY_ADMISSION_TEST_DATABASE_URL 指定的 loopback 可丢弃库，数据库名必须以 nearby_admission_test 开头；会重建测试表／函数，高德使用模拟响应。CI 启动 PostgreSQL 17 临时服务。

CI 对全部目标分支的 PR 和 master push 运行上述四类检查。生产 job 只在 master push 验证成功后运行；同分支 PR 的重复验证可取消，生产发布串行并核验最新主线 SHA。发布配置及结果见 [维护指南](../CONTRIBUTING.md#发布与回退)。

新增 deployment.test.mjs 使用内存 fetch 替身，覆盖无效输入、异常状态、部署提交不符、元数据匹配及凭据仅发送到 Vercel API，真实网络调用为 0。

当前生产业务默认最多两个类别任务、同次准入排队、HTTP 可重叠。全部类别失败保留完整列表和逐类原因；已发送批次独立排空 3s，事务空闲保护 5s。以下按日期记录保留此前版本的覆盖背景，当前行为以此段及主线源码为准。

2026-11-04 起，固定浏览器回归和真实历史业务集成均接入同一个必需 CI 检查。以下为当前执行方式；历史夹具及记录继续保留。真实高德、生产数据库和真实 Vercel 断连分别验收。

## Chromium 浏览器回归

首次准备（Node.js 24）：

```powershell
npm ci
npx playwright install chromium
$env:DATABASE_URL = "postgresql://test:test@127.0.0.1:1/nearby_browser_test"
$env:DIRECT_URL = $env:DATABASE_URL
npm run build
npm run test:browser
```

Linux CI 安装浏览器使用 `npx playwright install --with-deps chromium`。运行前生成当前源码的生产构建；runner 自动启动 `127.0.0.1:3119` 的 Next 服务，端口占用时明确失败。服务器强制使用占位数据库、空高德配置；页面导航前安装 API mock，外部请求和未知 API 使测试失败。启动预热对占位连接的 `database.prepare.failed` 为该隔离模式的预期日志。

覆盖候选确认、服务类别、半径、结果、部分／全部失败、超时重试、两层分页、分页失败保留及重试、取消、迟到响应、历史刷新／回放／删除、390px 键盘流程、空结果及请求隔离门禁。断言使用语义定位和条件等待。默认单 worker、零自动重试，保留首次失败。

定向运行：`npm run test:browser -- --grep "分页失败"`。新增 `e2e/browser/*.spec.ts` 自动加入此套件。修改源码后重新构建。

## 真实历史业务集成

启动一个独立 PostgreSQL 服务（CI 使用 PostgreSQL 17 临时服务）。明确提供测试连接：

```powershell
$env:NEARBY_HISTORY_TEST_DATABASE_URL = "postgresql://test_user@127.0.0.1:55441/nearby_history_test_local"
npm run test:history:integration
```

沿用上一步最新生产构建和 Chromium。URL 只接受 127.0.0.1、数据库名 `nearby_history_test` 前缀及字母数字下划线，不接受 URL 参数；目标选择只读取专用变量。账号需有建库权限和目标库迁移权限。setup 通过该本地服务的 postgres 管理库检查并按需创建指定测试库，再执行仓库的 `prisma migrate deploy --config prisma7.config.ts`；保留库供复查。使用现有测试库时也要求管理库连接权限。

Next 服务启动在 `127.0.0.1:3120`，DATABASE_URL／DIRECT_URL 强制指向专用库，高德配置为空。覆盖 HTTP → Next Route → Prisma → PostgreSQL 的保存、规范化去重、读取、删除、无效输入和访客隔离；SQL 查询独立核实持久化。浏览器场景保留真实历史 API，仅控制解析／搜索响应，验证搜索后保存、刷新、回放原中心、去重和删除。每个测试只清理本轮访客的历史数据。

HTTP API 测试检查生产 Secure／HttpOnly／SameSite Cookie，再显式转发 Cookie 到 loopback HTTP 服务；浏览器场景另外验证实际浏览器 Cookie 行为。新增 `e2e/integration/*.spec.ts` 自动加入。准入集成继续使用独立的 NEARBY_ADMISSION_TEST_DATABASE_URL。

## 失败证据和验收

- `npm run test:browser:report` 或 `npm run test:history:report` 打开各自 HTML 报告。
- `test-results/browser/` 与 `test-results/history/` 保存失败截图、上下文和 trace；用 `npx playwright show-trace 路径/trace.zip` 查看操作与请求。
- CI 的 `web-test-evidence` Artifact 汇总 HTML 报告及失败产物，保留 7 天。CI 在构建后顺序执行接口模拟、浏览器回归和历史集成；失败阻止同一检查成功及后续生产 job。
- 验证测试有效性时，临时破坏一个关键行为、确认相关测试失败、保留报告、恢复源码，再重建并运行。对照记录注明基线 SHA、本地差异、命令、退出码与结果。

## 历史覆盖记录


默认 npm test 使用受控替身，包含 AST 高德出口门禁、核心/Route 测试及数据库连接准备、流水批次、诊断和取消测试。npm run check、npm run build 分别验证类型和生产构建。

独立数据库集成命令：

```powershell
$env:NEARBY_ADMISSION_TEST_DATABASE_URL = "postgresql://test_user@127.0.0.1:55440/nearby_admission_test_local"
npm run test:admission:postgres
```

该命令只接受 127.0.0.1 且数据库名前缀 nearby_admission_test 的可丢弃数据库，重建准入表、函数、触发器及审计夹具。数据库入口使用 NEARBY_ADMISSION_TEST_DATABASE_URL，高德使用模拟响应。CI 采用 PostgreSQL 17 临时服务独立运行此步骤。

覆盖预约容量、原子扣额、防重、上海日/月周期、资源/绑定/策略变更及竞争、跨进程速率、取消、提交确认丢失、SQL/驱动超时、后端断连、迟到连接、部分结果和真实 Route。十类别与单次准入测试复用 TCP 代理，对请求/响应各增加 150ms，验证共享账本及完整准入两批次。原结果返回后额外延迟模型的 CI 失败与新模型差异见调查文件。最终响应延迟超过许可 400ms 时发送停止。结果见 [交付记录](../harness/build/2026-10-28-admission-functions.md)。

2026-10-29 Preview 实测：同版本真实地点解析返回 10 个候选，十类别全部成功、约 20.7 秒；共 11 次真实高德调用。函数迁移及受控回归、计数与清理证据见[调查文件](../harness/build/2026-10-29-admission-chain-investigation.md)。

## 时间与失败治理回归（2026-10-29）

`admission.test.ts` 验证许可单次使用、取消／期限、有限等待、非对称 RTT 下的预约等待、2s 局部超时原因及真实三个 Route 的准入处理。`search-service.test.ts` 覆盖十类别串行且无固定计时等待、错误性质／范围、单次与连续准入等待失败后继续、额度／数据库／认证故障后停发、全部失败和整体超时保留结果。`request-lifecycle.test.ts` 与 `transport.test.ts` 同步模拟计时器和单调时钟，验证父预算、截止点、事件循环延迟时同步检查及取消清理。`request-safety-route.test.ts` 通过真实 Route 验证 HTTP 或准入挂起时超时快照 200、尚无完成结果的 504，以及已有结果后的取消 499。`web-logic.test.ts` 覆盖已完成计数与未执行类别的分页限制。Route 传输测试显式 mock 准入边界；AST 门禁核验两个服务端工厂的准入 hook。

独立 PostgreSQL 测试应用新增预约屏障迁移，核验迁移重入、资源和绑定保持、十类别 300ms TCP RTT、并发额度及许可安全。提交副本的测试数量以交付记录的 PR 补充为准。

## 准入事务诊断补充（2026-10-29）

`admission-diagnostics.test.ts` 用受控连接验证每阶段四条命令在等待结果前全部入队、事务限时、COMMIT／ROLLBACK 确认、敏感信息清除、固定 SQLSTATE 诊断、协议校验、许可失败关闭、取消后排空、迟到连接回收和申请上限。生产失败日志保留 phase、step、acquireMs、batchMs、elapsedMs、remainingMs、budgetMs、maxWaitMs、committed、sqlState、admissionCode，新增 attemptId、operation、readTimeoutMs、statements、functionToCommitMs、commitAck、connectionDestroyed、errorKind；成功路径保持静默。

逐语句诊断覆盖 BEGIN、configure、function、COMMIT，记录相对批次开始的 submittedMs／settledMs、状态、命令白名单、SQLSTATE 和固定错误分类。`functionToCommitMs` 表示客户端观察到的函数结果返回至 COMMIT 结果到达的间隔；函数未成功返回或 COMMIT 未结算时为 null。`commitAck` 区分 confirmed_commit、confirmed_rollback、unconfirmed、not_submitted；`connectionDestroyed` 记录执行器是否以 `release(true)` 请求销毁已借用连接。BEGIN 失败使用独立的 begin 标签，acquire 专指借连接。

2026-10-29 增补回归：COMMIT 读取超时与逐语句 SQLSTATE、延迟提交计时、断连时仍保留已确认提交、同步发送失败、取消后排空、诊断读取异常和日志输出异常、reserve／多次 grant 的 attemptId 关联，以及日志敏感字段排除。对应验证结果见[事务诊断交付记录](../harness/build/2026-10-29-admission-transaction-diagnostics.md)。


## 2026-10-29：异常恢复与两类并行回归

reserve／grant 已发送批次读取排空上限为 3000ms，独立于业务 2s 与票据期限；事务空闲上限 5000ms。此前 1200ms 参数描述保留为历史版本背景。

admission-diagnostics 覆盖安全日志、恢复性质、空闲状态及 COMMIT 观测抵扣。readiness/runtime 覆盖冷却等待、共享恢复、取消隔离及剩余健康连接。search-service、request-lifecycle 和真实 Route 覆盖最多两任务、准入停止令牌、乱序完成、按索引截止快照、全失败列表和实际 termination；内部 concurrency: 1 保留串行对照。

admission-postgres 增加 reserve／grant COMMIT 延迟 100／400／1200／2500／3300ms、约 104ms 票据余量及 5s 事务空闲回归；SQL 取消、锁等待、死锁、序列化、断连和驱动读取超时后，同轮后续类别可成功。高德使用模拟响应，仅连接独立 loopback 临时库。相关源码及准确提交验证见[交付记录](../harness/build/2026-10-29-recovery-parallel.md)。


## 接口模拟与 Codex 验收入口

```powershell
npm run test:api         # 编译并运行真实 Route，使用传输、准入和历史服务替身
npm run test:acceptance  # 最新生产构建 → 接口模拟 → 浏览器回归
```

`test:api` 自动发现 `test/*-route.test.ts` 和 `api-contract.test.ts`，并运行隔离器自检，使用与默认测试相同的 Node 模块 mock／历史 Route loader。隔离预加载器禁止真实 fetch 和 TCP 连接；测试必须显式提供替身。模拟高德成功、空、失败、超时和取消，核验参数、HTTP 状态、响应及调用次数；历史覆盖访客隔离和写入失败。历史写入失败保持当前 Route 的异常传播行为，独立数据库套件继续验证真实 HTTP／Prisma 链路。

接口结果位于 `test-results/api/assertions.json`，仅保存场景断言名、状态、耗时和白名单请求摘要；原始异常、密钥、URL 查询和响应正文不进入此文件。终端诊断使用合成数据。

浏览器／历史套件另生成 `test-results/<套件>/results.json` 和 `source.json`。浏览器每个场景附加最终状态截图、合成 API 请求记录和未处理错误列表；HTML 报告可查看附件，失败保留 trace。生产构建写入 `.next/test-source.json`，套件启动前核对源码指纹，过期构建要求先重建。接口和浏览器场景模拟层分别验证服务端协议与页面行为。

`test-results/evidence/{api,browser,history,acceptance}/run.json` 记录开始／结束时间、HEAD、工作区修改状态、源码 SHA256、命令、退出码与证据目录；执行期间源码变化会令命令失败。指纹按 Git 管理及未忽略文件的路径和内容计算，包含当前未提交实现。报告和生成文件被忽略，CI 上传证据保留 7 天。每次运行覆盖同套件结果；需保留故障对照时先复制对应报告目录。

`test:acceptance` 在子进程提供本地占位数据库配置，方便干净环境执行；历史集成仍需单独准备测试数据库。定向接口运行示例：`npm run test:api -- --test-name-pattern "second-page"`。

日常页面改动运行 `test:acceptance`；仅接口改动运行 `test:api` 并执行常规检查；历史持久化改动追加独立数据库集成。依赖安装后先执行 `npx playwright install chromium`，CI 使用 `--with-deps chromium`。当前浏览器套件采用 Chromium 桌面和 390px 移动视口，零重试。

## 2026-11-04 分类流式补充

`test/search-stream-route.test.ts` 自动纳入单元与API验收测试，覆盖进度、超时、取消与NDJSON解析。`e2e/browser/category-stream.spec.ts` 使用纯浏览器fetch夹具验证逐类返回、多框与排序独立、分页重试、断流保留、新输入取消及390px键盘展开。原搜索用例更新为先展开类别再检查地点，重复错误文案定位到对应类别区域。当前验收结果见[Preview记录](../harness/build/2026-11-04-category-preview.md)。
