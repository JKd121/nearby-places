# 测试与验证

本文说明当前分支已有的测试入口；测试清单以根目录 `package.json` 为准，具体结果见 [项目状态](../PLANS.md) 和 [历史证据](../harness/build-log.md)。不固定承诺某个测试数量，以对应版本的实际输出为准。

## 上线／本机登录页回归（2026-11-07）

`npm run test:e2e:beta` 默认运行 private-beta 的 10 项测试，验证仅账户登录、隐藏注册与匿名入口、真实服务端拒绝、错误重试、429 恢复及账户 Key 管理。设置测试专用变量 `NEARBY_BETA_E2E_ACCESS_MODE=local-beta` 后，同一命令运行新增的 1 项本机流程：共享登录表单、卡片外匿名入口、密码显示切换、窗口恢复保留输入、390px 和短窗口可操作、匿名转预建账户、退出清理。两种模式分别输出桌面和手机截图。

两个运行模式使用相同端口 3127 和独立临时数据库，顺序执行。此测试变量仅供夹具选取模式，应用真实访问模式继续由 `NEARBY_ACCESS_MODE` 控制。CI 已增加本机模式步骤。原完整认证 Chromium 的 15 项继续覆盖原邮箱认证入口。

执行前设置专用的 `NEARBY_IDENTITY_TEST_DATABASE_URL`，规则与下方 PostgreSQL／浏览器说明一致；测试会重建该临时库。结果见[登录页交付记录](../harness/build/2026-11-07-login-page-redesign.md)。

## 身份系统整合回归（2026-11-07）

完整认证 Chromium 套件增加连续业务场景：匿名搜索和本地历史 → 注册验证并登录 → 匿名历史清理及空账户历史 → 新版弹窗添加／更换 Key → 搜索验证和账户云端历史 → 移除 Key 保留历史 → 退出后重新匿名体验，确认账户信息、Key 入口及云端历史隔离。该场景使用专用临时 PostgreSQL、测试 SMTP 和模拟高德，运行命令为 `npm run test:e2e`；套件现有 15 项。

本轮只补充整合断言与统一文档；其余已验证模块保持原实现。当前执行结果见[整合记录](../harness/build/2026-11-07-identity-integration.md)，前次全量检查结果保留在对应日期的交付记录中。

## Key 管理界面回归（2026-11-07）

`npm run test:e2e:beta` 当前包含 10 项 Chromium 用例，新增的 `e2e-beta/credential.spec.ts` 覆盖四种凭证状态、仅末四位展示、弹窗编辑、格式校验、错误重试、提交期间保护、Tab／Shift+Tab／Esc／遮罩关闭与焦点恢复、390px 布局、近期认证超时、编辑中超时及会话撤销清理、验证后恢复编辑／移除确认、删除后保留云端历史和重新配置。概览用例也验证搜索与个人中心往返保留输入。

原 `e2e/identity.spec.ts` 的 14 项完整认证流程已调整为弹窗操作，继续覆盖注册验证／密码重置、多标签页身份清理和迟到历史响应。身份 PostgreSQL 套件新增 credentialRequiresReauth 的新鲜／过期会话及 private, no-store 断言，当前 23 项。

两组浏览器测试顺序执行，共用应用端口 3127 和 .next；使用专用临时 PostgreSQL 和模拟高德。截图、运行结果及持久账号保留检查见[本次实施记录](../harness/build/2026-11-07-key-management-ui.md)。

## 登录安全补测（2026-11-07）

`npm run test:login-security:postgres` 包含 31 项真实临时 PostgreSQL 测试，覆盖 verified／local-beta／private-beta。沿用 NEARBY_IDENTITY_TEST_DATABASE_URL 的 loopback 与 nearby_identity_test* 库名前缀保护，执行前重建专用测试库。

- 成功登录：正确用户、HttpOnly／SameSite Cookie、生产 HTTPS Secure Cookie、资源访问和退出。
- 失败登录：账号不存在／密码错误／两者错误统一响应，停用和内测资格拒绝，无新会话或登录 Cookie，原匿名身份保留。
- 现有限流：独立清理计数后精确验证前三次与第四次、持续拒绝、Retry-After 和数据库时间到期恢复；并发 8 请求及双进程共享同一桶。
- 故障注入：只在专用临时库短暂重命名 GuestSession 或 RequestCounter，验证服务错误和事务回滚，finally 恢复表名；取消测试直接调用公共 handler 并等待事务回滚完成。
- 来源与路径：Vercel 地址校验、伪造通用转发头、IPv6／IPv4 映射表示、单尾斜杠及查询参数归一化、歧义路径拒绝。
- 不存在账号的哈希路径通过认证库上下文受控插桩验证，避免依赖机器性能的耗时阈值。

原完整认证套件的限流测试也改为明确断言 3 次认证失败、第 4 次 429 及无会话副作用。内测 Chromium 新增真实倒计时／恢复和真实计数表故障后重试；完整认证 Chromium 增加倒计时恢复。两个浏览器套件分别为 5 项和 14 项，顺序运行，使用模拟高德。计数时间边界在集成测试中调整临时库 resetsAt；浏览器实际等待原 10 秒窗口，不修改生产阈值。

CI 新增安全集成入口。全量方法与实际结果见[登录安全交付](../harness/build/2026-11-07-login-security.md)。测试期间停用本机开发服务以释放 .next 开发锁，完成后恢复；持久库保留开发者账号和 Key。

## 小范围内测回归（2026-11-07）

- `npm run test:beta:runtime`：本机生命周期目标限制、明确 beta 配置要求、非交互终端密码输出保护；纳入 `npm test`。
- `npm run test:beta:postgres`：沿用独立 `NEARBY_IDENTITY_TEST_DATABASE_URL` 的 loopback／库名前缀保护，重建专用临时库。覆盖预建账号、无 SMTP 登录、关闭注册与邮件接口、私有模式拒绝新旧匿名会话、账号隔离、Key 管理、真实 SQL 放行、测试资格、停用及密码重置。
- `npm run test:e2e:beta`：独立临时库、本地 Next 和模拟高德，使用 `playwright.beta.config.ts`，覆盖桌面／390px登录、关闭注册／匿名入口、Key 保存及搜索／云端历史、身份切换、临时失败重试、停用退出。仅使用随机临时测试凭据，报告和截图位于 `.local/nearby-beta-e2e/`。
- 原有 `test:identity:postgres` 与 `test:e2e` 显式使用 `verified` 模式，继续验证邮箱认证流程。两套浏览器测试顺序执行，避免共享 `.next` 开发锁；同一临时数据库的重建套件也顺序执行。
- 本机持久环境通过独立生命周期验收检查停止／启动前后的配置、开发者账号、加密凭证及历史数量一致，使用 `nearby_beta_local`；自动化夹具只接受 `nearby_identity_test*`，保持数据隔离。

测试数据库命令通过后按既有流程运行 `npm run lint`、`npm run check`、`npm run build` 及完整依赖审计。CI 已接入新增 PostgreSQL 和 Chromium 内测套件。实际结果见[内测交付记录](../harness/build/2026-11-07-private-beta.md)。

## 身份交互与依赖回归（2026-11-05）

`npm test` 追加 `test:lint-compat` 的 6 项回归，验证三个旧 Lint 插件在 Minimatch 11 下的 React／导入／可访问性规则、glob 匹配、真实忽略规则，以及独立临时夹具中的补丁失配失败。`npm run lint` 检查实际 app／src，规则等级保持原配置。

先执行完整 `npm ci`，确认三份补丁应用成功与 Prisma 7.10.1 显式生成，再运行 `npm audit --include=dev --include=optional`。安装脚本使用 `patch-package --error-on-fail`；补丁源码、版本和移除条件见 [patches](../patches/README.md)。

`npm run test:e2e` 当前有 13 项 Chromium 用例，运行本地 Next 应用、独立临时 PostgreSQL、测试 SMTP，并以模拟高德响应验证业务。新增覆盖窗口／定时刷新保留表单、临时身份错误重试、匿名注册后新标签页验证、重新认证返回设置、跨账户 Key 输入清理、迟到历史与搜索响应。第 12 项使用受控身份／额度响应专门验证替换会话后的迟到额度竞态，其余用例使用本地身份接口并按场景注入错误。每例仅清理专用测试库的浏览器认证／匿名创建速率计数，限流正确性由 PostgreSQL 套件独立验证。

升级后的迁移兼容验证先在空临时库部署旧五份迁移，插入访客历史、公共资源计数和操作绑定，再部署第六份双身份迁移，检查保留值并比较迁移前后 Schema 差异。原有外键更新策略与默认表达式差异保持一致。完整命令、版本和日志见[实施记录](../harness/build/2026-11-05-identity-interaction-dependency-update.md)。

## 分类流式结果（2026-11-04）

`search-stream.test.ts` 纳入 `npm test`，覆盖首类及时返回、乱序完成、唯一终结消息、流开启后的截止与取消、截止前快照、共享错误与全部类别失败、开启流前400/413/499/504，以及 UTF-8 拆包、合包和意外断流。高德和准入均使用替身。

浏览器安装夹具：读取 `test/category-browser-fixture.mjs`，将 `installCategoryBrowserFixture` 函数作为导航前 init script 执行。夹具拦截全部 API，使用 `window.__categoryFixture.push(categoryId, status, count)` 推送类别；`finish()` 结束整轮，`breakStream()` 模拟断流，`failPage = true` 使下一次分页失败。未知 URL 直接报错。桌面与390px移动端检查步骤和结果见[本轮记录](../harness/build/category-results-2026-11-04/README.md)。浏览器夹具由人工工具运行，尚未加入 CI 自动浏览器测试。

## 常规隔离检查

使用 Node.js 24 和 `npm ci` 安装的锁定依赖，在仓库根目录运行：

```powershell
npm test
npm run check
npm run build
```

`npm test` 依次执行 `check:boundary`、核心 TypeScript 编译、历史 Route 测试编译、显式列出的 Node.js 测试，随后运行 `amap-boundary.test.mjs` 和 `test:lint-compat`。新增 `.test.ts` 文件后，需要同步 `package.json` 的显式测试列表；仅创建文件不会自动加入这条命令。

历史 Route 测试使用 Node.js 的实验模块 mock、`history-route-loader.mjs` 和 `react-server` 条件。直接裸跑某个编译文件可能缺失这些参数；实验 API 警告本身不代表失败。

隔离测试以 mock/内存替身替代高德和 Prisma；传输测试另有 `127.0.0.1` 临时 HTTP 服务验证流式读取，不需要外部高德额度、可连接数据库或真实密钥。`smoke.test.ts` 测试的是 smoke 编排逻辑，**不是执行 `npm run smoke`**。

`npm run check` 包含 Next 路由类型生成；`npm run build` 包含核心及 Next webpack 生产构建。这些命令会写入 `dist/`、`.next/` 和类型缓存，不适用于严格只读检查。

Web 构建会导入数据库模块，因此需要 `DATABASE_URL`。在没有配置的独立测试终端中，可沿用 CI 的进程级占位连接：

```powershell
$env:DATABASE_URL = "postgresql://ci:ci@localhost:5432/nearby_ci"
$env:DIRECT_URL = "postgresql://ci:ci@localhost:5432/nearby_ci"
npm run check
npm run build
```

该地址只供隔离检查，不代表已启动 PostgreSQL；不要在此终端继续做真实历史功能验收。Prisma 客户端缺失时执行 `npx prisma generate --config prisma7.config.ts`，无需运行迁移或 `db push` 来通过隔离测试。

## 覆盖地图

2026-10-29 恢复与并行增补：reserve／grant 已发送批次的读取排空上限统一为 3000ms，独立于 2s 业务截止及票据期限；事务本地空闲上限为 5000ms。下段 1200ms 描述保留当时版本背景，当前参数及验证见[恢复与并行记录](../harness/build/2026-10-29-recovery-parallel.md)。

- `admission-diagnostics` 验证恢复标签、SQLSTATE、连接空闲状态、COMMIT 观察抵扣、日志脱敏与单次汇总；`database-readiness`／`database-runtime` 验证冷却等待、共享恢复、取消隔离及池内剩余连接可用。
- `search-service` 默认最多两个类别任务，准入排队并与 HTTP 重叠；显式 `concurrency: 1` 保留串行对照。覆盖乱序完成的原顺序返回、临时故障后继续、全部失败列表、额度／认证停止、未发送任务撤销、已发送结算及按索引的截止快照。`request-safety-route` 覆盖相应真实 Route 的安全响应。
- `admission-postgres` 通过真实本地 PostgreSQL 的 TCP 代理注入 reserve／grant COMMIT 延迟 100／400／1200／2500／3300ms；验证调用者 2s 到期、后台 3s 有界排空、保守扣额、健康复用与连接替换。SQL 取消、锁错误、死锁、序列化、断连及驱动读取超时注入后，后续类别继续成功。另验证 5s 事务空闲终止和约 104ms 票据余量下的零过期发送。

性能对照使用真实独立临时库、300ms 双向合计 TCP 延迟、2s 或 5ms 模拟高德响应。结果及每轮类别状态保存在本地验证目录；计入真实高德调用 0 次。

2026-10-29 提交确认窗口回归：`admission-diagnostics.test.ts` 验证独立确认读取预算及到期后的明确 COMMIT／健康连接归还；`admission-postgres.test.ts` 的 TCP 代理仅滞留首轮预约／放行 COMMIT 响应，验证首类过期、随后类别成功、两个提交扣额但仅一次模拟高德发送。日志增加 `completionRemainingMs` 和 `reservation`；确认读取上限保留 1200ms，总准入保留 2s。完整实验、前后对照及本地验证见[提交确认窗口记录](../harness/build/2026-10-29-admission-commit-window.md)。

`admission-diagnostics.test.ts` 用受控连接验证每阶段四条命令在等待结果前全部入队、事务限时、COMMIT／ROLLBACK 确认、敏感信息清除、固定 SQLSTATE 诊断、协议校验、许可失败关闭、取消后排空、迟到连接回收和申请上限。生产失败日志保留 phase、step、acquireMs、batchMs、elapsedMs、remainingMs、budgetMs、maxWaitMs、committed、sqlState、admissionCode，新增 attemptId、operation、readTimeoutMs、statements、functionToCommitMs、commitAck、connectionDestroyed、errorKind；成功路径保持静默。

逐语句诊断覆盖 BEGIN、configure、function、COMMIT，记录相对批次开始的 submittedMs／settledMs、状态、命令白名单、SQLSTATE 和固定错误分类。`functionToCommitMs` 表示客户端观察到的函数结果返回至 COMMIT 结果到达的间隔；函数未成功返回或 COMMIT 未结算时为 null。`commitAck` 区分 confirmed_commit、confirmed_rollback、unconfirmed、not_submitted；`connectionDestroyed` 记录执行器是否以 `release(true)` 请求销毁已借用连接。BEGIN 失败使用独立的 begin 标签，acquire 专指借连接。

2026-10-29 增补回归：COMMIT 读取超时与逐语句 SQLSTATE、延迟提交计时、断连时仍保留已确认提交、同步发送失败、取消后排空、诊断读取异常和日志输出异常、reserve／多次 grant 的 attemptId 关联，以及日志敏感字段排除。对应验证结果见[事务诊断交付记录](../harness/build/2026-10-29-admission-transaction-diagnostics.md)。

`database-readiness.test.ts`、`database-runtime.test.ts` 和 `database-startup.test.ts` 覆盖共享准备、取消隔离、失败冷却、截止与迟到完成、墙钟回退、池移除失效、短准入计时衔接、普通池配置保持、Vercel 辅助仅挂载一次及构建/Edge 跳过。默认测试使用假连接或假 store；真实只读连接复用证据单独记录在 [预热实现说明](../harness/build/2026-10-28-admission-database-warmup.md)。

`poi-union.test.ts` 纳入默认 `npm test`，覆盖隔离联合查询 CLI 的默认无网络、3/5/10 类组合、精确编码/父子编码未确认、异常/空数据、真实准入 service 搭配假 store 的调用顺序、拒绝/许可失效/取消/超时停止、最多 9 次、跨进程预算锁、失败检查点及报告脱敏。CLI 子进程测试禁止原生 fetch；Live 缺失配置检查清空进程 Key/数据库变量；全部不调用真实高德或数据库。使用及证据见 [实验说明](../scripts/experiments/poi-union/README.md)；这不代替真实 PostgreSQL 或 Live 验收。

`admission.test.ts` 验证许可单次使用、取消／期限、有限等待、非对称 RTT 下的预约等待、2s 局部超时原因及真实三个 Route 的准入处理。`search-service.test.ts` 覆盖十类别串行且无固定计时等待、错误性质／范围、单次与连续准入等待失败后继续、额度／数据库／认证故障后停发、全部失败和整体超时保留结果。`request-lifecycle.test.ts` 与 `transport.test.ts` 同步模拟计时器和单调时钟，验证父预算、截止点、事件循环延迟时同步检查及取消清理。`request-safety-route.test.ts` 通过真实 Route 验证 HTTP 或准入挂起时超时快照 200、尚无完成结果的 504，以及已有结果后的取消 499。`web-logic.test.ts` 覆盖已完成计数与未执行类别的分页限制。Route 传输测试显式 mock 准入边界；AST 门禁核验两个服务端工厂的准入 hook。

提前停止时，`search-service.test.ts` 还核验注入的 `Diagnostics` 收到一次 `search.stopped`，包含类别、公开错误码、已完成和未执行数量；正常及可恢复错误不产生该事件。当前 Route 尚未接入诊断实现，测试事件不代表线上已有对应日志。

### 独立 PostgreSQL 准入测试

```powershell
$env:NEARBY_ADMISSION_TEST_DATABASE_URL = "postgresql://test_user@127.0.0.1:55439/nearby_admission_test_local"
npm run test:admission:postgres
```

须先准备**可丢弃的独立测试数据库**。命令只接受 `127.0.0.1` 且数据库名以 `nearby_admission_test` 开头的 URL，测试入口使用 `NEARBY_ADMISSION_TEST_DATABASE_URL`。会重建测试库内的准入表、两个函数、触发器及审计表。测试应用实际迁移，运行真实 pg 流水事务和独立 Node 子进程，高德响应使用模拟实现。CI 配置 PostgreSQL 17 临时服务并单独运行此命令；默认 `npm test` 继续采用隔离替身。

集成覆盖预约容量、防重、最后额度竞争、日／月独立更新及上海重置时间、时区、策略版本、绑定改动与锁等待竞态、跨进程速率、取消、函数 SQL 超时、丢失提交确认、连接池回收及三个真实 Route。十类别和单次准入均通过 loopback TCP 代理对请求与响应各增加 150ms 延迟，覆盖约 300ms RTT。超过 400ms 的最终批次延迟验证许可过期保护。本轮结果见 [时间与失败治理交付记录](../harness/build/2026-10-29-time-and-failure-governance.md)；旧版本结果保留在 [短事务交付记录](../harness/build/2026-10-28-admission-functions.md)。

| 文件组 | 主要覆盖 |
| --- | --- |
| `categories`、`client`、`distance`、`sort`、`smoke` | 类别和字段归一化、距离回退、排序限制、策略比较编排 |
| `location-router`、`location-normalize`、`location-resolver`、`location-route` | 地点意图、地址归一化、候选解析与 Route 校验 |
| `search-validation`、`search-service`、`search-page-route`、`web-logic` | 确认中心和半径校验、无固定等待的串行调度、部分与全部失败、第 2 页、本地展示逻辑 |
| `search-history`、`history-route`、`history-store` | 完整中心保存/恢复、去重、有效历史过滤、访客边界、加载/删除/过期响应 |
| `result-card-spike` | 卡片调研数据处理；不证明照片已接入产品 |
| `transport`、`request-lifecycle`、`request-safety-route` | 取消、单次/整体时限、上下游限读、安全错误、清理和三个高德 Route 集成 |
| `amap-boundary.test.mjs`、`scripts/check-amap-boundary.mjs` | 统一出口 AST 门禁及绕过方式的正反例 |

表中文件组对应本目录同名 `.test.ts` 文件；完整顺序见 npm 脚本。

### 定向运行示例

先编译，再带现有执行参数运行目标文件：

```powershell
npm run build:core
npm run build:test-route
node --experimental-test-module-mocks --experimental-specifier-resolution=node --experimental-loader ./test/history-route-loader.mjs --conditions=react-server --test dist/test/search-service.test.js dist/test/search-page-route.test.js
npm run check:boundary
node --test test/amap-boundary.test.mjs
```

## 浏览器夹具与人工验收

当前没有 `npm run test:browser`，CI 也不执行浏览器自动化。其他未合并分支的 Playwright 命令或旧 PR 描述不适用于本分支。

- `history-browser-server.mjs`：历史 UI 隔离代理，默认监听 `127.0.0.1:3107`，转发到本地应用的 3108 端口；可通过 `UI_FIXTURE_PORT` / `UI_UPSTREAM_PORT` 指定端口。使用前需确认页面已加载夹具且 API 走替身。最终工作台验收曾采用生产构建代理，具体版本和端口见 [工作台证据](../harness/build/ui-workspace-evidence/README.md)。
- `request-safety-browser.mjs`：导出的 `runRequestSafetyBrowser()` 是页面内测试函数；需由浏览器执行器在页面环境加载并调用，不是 `node` 单独运行即可完成的测试。调用前应在首次导航时安装 API dispatcher，防止真实历史预取，并确认所有 API 被 mock 接管；场景覆盖旧响应、取消、回放和第二页失败保留结果。
- `request-safety-unmount-server.mjs`：`node test/request-safety-unmount-server.mjs` 打包真实 SearchApp 并监听 `127.0.0.1:3123`，供挂载/卸载取消场景使用。脚本只提供页面；还需浏览器测试函数配合。生成文件放在系统临时目录，CSS 被替换，不能用于视觉或布局验收。

真实产品验收还需观察候选确认、10 类/半径选择、分类展开和独立排序、两种加载更多、各种反馈、历史刷新/删除/直接回放，以及键盘和手机布局。浏览器替身验证 UI 行为，不证明真实高德、PostgreSQL 或物理设备表现。

## 外部验证与证据边界

`npm run smoke`、`resolver:spike`、`resolver:address-micro`、`result-card:spike`、`result-card:photo-review` 会调用真实高德；数据库迁移、真实历史写入和线上验证也不是隔离检查的一部分，按具体任务范围执行。

`.github/workflows/ci.yml` 使用 Node.js 24，只在面向 master 的 PR 和 master push 执行安装、test、check、build，不连接真实数据库，不运行浏览器场景或真实 API smoke。

报告结果时注明版本、命令和数据来源：本地通过、CI success、Preview Ready、生产冒烟和真实端到端分别陈述。`vercel.json` 的取消配置或本地 AbortSignal 断言，都不能证明真实 Vercel 客户端断连已完整传播到上游并释放资源；该项仍待专门验收。


## 双身份、BYOK 与浏览器自动化（2026-11-04）

`npm test` 增加 Cookie 签名／过期／伪造、AES-GCM 用户绑定／密文损坏／轮换、HMAC 分域和匿名本地历史测试。历史 Route 测试改为已验证账户夹具；匿名访问直接拒绝。原 V1 PostgreSQL Route 回归使用可信访问夹具隔离身份层，保留真实工厂、传输和公共预算校验。

`npm run test:identity:postgres` 使用独立的 `NEARBY_IDENTITY_TEST_DATABASE_URL`，只接受 `127.0.0.1` 且库名以 `nearby_identity_test` 开头。命令重建该测试库的 public schema、依次执行迁移并启动 25260 端口的测试 SMTP；覆盖真实邮件验证、账户隔离、加密凭证、60／61 次准入、跨进程限流、共享 Key、并发租约、失效会话、损坏密文和上游异常映射。请使用专用空库。

`npx playwright install chromium` 后执行 `npm run test:e2e`，沿用同一独立测试库。夹具重建测试库、启动 SMTP 25260、测试收件箱 3128、应用 3127；高德由独立 Node preload 模拟，生产模块保持原统一出口。覆盖匿名本地历史、注册验证、BYOK、云端历史、密码重置、多标签页、390px入口、无效／耗尽／删除 Key 及流式搜索中途额度耗尽。端口需空闲。

浏览器报告位于 `.local/byok-playwright-report`，失败截图与 trace 位于 `.local/byok-playwright-results`。`npm run lint` 使用 ESLint 9 与当前 Next 配套规则。CI 已接入上述 PostgreSQL、SMTP、Chromium、Lint、类型与生产构建检查；远端结果以实际运行记录为准。
