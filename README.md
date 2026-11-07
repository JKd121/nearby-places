# 地点周边生活服务聚合器

输入地点、确认搜索中心，按类别和半径查询附近生活服务。项目已从高德 API 能力 Spike 演进为 Next.js 全栈 Web 应用，包含统一搜索工作台、Guest／Account 双身份、BYOK、分身份历史和请求安全基线；早期 CLI 调研脚本仍保留。

当前登录、双身份、登录安全和新版 Key 管理已经接入同一个应用入口。本机运行 `npm run beta:dev`，访问 [localhost:3130](http://localhost:3130)；使用预建账户登录，或选择匿名体验。登录后通过个人中心管理自己的 Key，搜索使用该账户凭证并保存账户历史。访问模式和验证清单见[身份系统整合记录](harness/build/2026-11-07-identity-integration.md)。

## 目前支持

- 地点解析、候选选择及确认后搜索；搜索使用已确认坐标，不重复解析中心。
- 酒店、商场、火锅、面包、甜品、KTV、台球厅、健身房、公交站、地铁站共 10 类，支持分组选择及 1/2/3/5 km 半径。
- 搜索按类别逐步返回，每类独立结果框默认收起，可同时展开多个；各类别独立排序与分段加载，整轮完成后可按单类别获取高德第 2 页。
- 结果卡展示地址、距离、可用的评分/消费/标签及高德原始营业时间文字，提供高德位置链接。缺失字段不补造，不推断“正在营业”。
- 多类别搜索默认最多两个任务并行，同一搜索的准入排队，HTTP 响应可重叠；类别框保持原类别顺序，完成结果即时更新。临时数据库故障逐类记录后继续，额度、认证或明确配置错误停止新增类别；整体截止保留已完成结果，用户取消结束请求。
- 全部类别尝试失败时仍显示完整类别列表、零类完成和逐类失败原因。准入事务独立排空至多 3 秒，确认空闲的健康连接复用，损坏连接从池中移除后替换。
- 匿名体验每日 60 次高德调用准入，历史保存于当前浏览器，刷新恢复、退出清除；账户使用自己的加密托管 Key，云端历史按 userId 隔离，支持刷新、删除及直接回放。旧访客云端历史独立保留。
- 身份选择、邮箱验证注册、登录退出和密码找回；个人中心以概览卡片展示 Key 脱敏状态，添加／更换在弹窗中完成，移除须单独确认。超过近期认证期限时先验证当前账户密码，再继续原操作。窗口恢复与定时身份刷新保留草稿，会话变化时清理旧搜索、历史缓存和敏感输入，临时刷新失败可重试。

收藏、内嵌地图、POI 照片和公交线路/时刻表仍在后续范围。公交与地铁类别目前只查询站点 POI。当前项目状态和待办见 [PLANS.md](PLANS.md)。

独立实验工具：[高德 POI 2.0 多类别联合查询 V1](scripts/experiments/poi-union/README.md)。`npm run experiment:poi-union` 默认只生成计划；加 `-- --mode mock` 可验证模拟响应和 JSON/Markdown 报告，不调用真实高德或数据库。真实采集必须另获授权，不改变产品搜索策略。

经用户另行授权的[本地真实探索入口](scripts/experiments/poi-union/LOCAL-EXPLORATION.md)：`npm run experiment:poi-union:local` 默认 Dry；该独立入口跳过 PostgreSQL 准入，复用统一高德传输及本轮 9 次本地预算，普通请求失败记录后继续下一项。

排序小对照：`npm run experiment:poi-union:sort` 默认 Dry；同三地点、10类、distance/weight各一次，共6次的独立授权回合，入口与结果说明见[本地实验文档](scripts/experiments/poi-union/LOCAL-EXPLORATION.md)。

## 登录安全回归（2026-11-07）

登录失败统一提示“邮箱或密码有误”，覆盖不存在账号、错误密码、停用及未获内测资格。登录会话创建与匿名会话结束在同一持久化事务内完成，清理失败回滚新会话；服务异常返回可重试的 503。允许的单尾斜杠与查询参数路径统一处理，歧义路径明确拒绝。

现有限流保持同一来源登录 3 次／10 秒，页面根据 Retry-After 展示倒计时并恢复提交。Vercel 仅信任平台覆盖的单个有效客户端地址；本机和未适配代理环境继续使用共享来源桶。同来源其他用户也可能受该窗口影响。账号级、联合限流、临时状态清理及治理状态迁移记录在后续缓存版本清单。

新增 `npm run test:login-security:postgres`，使用独立临时库验证三种模式、并发／多进程、真实表不可用故障、会话回滚和代理来源。具体证据、支持环境与缓存交接见[登录安全记录](harness/build/2026-11-07-login-security.md)。

## 小范围内测版

内测版使用预建账号和邮箱＋密码登录，账号管理通过终端命令完成。访问模式由服务端 `NEARBY_ACCESS_MODE` 指定：`verified` 默认保留完整邮箱认证；`local-beta` 保留本机匿名体验；`private-beta` 只允许有内测资格的账号，关闭匿名访问。两个 beta 模式均关闭公开注册与邮件接口，生产运行拒绝 `local-beta`。

两种模式共用居中登录页：标题说明位于表单上方，卡片采用浅边框、半透明白底与柔和阴影。上线模式只显示品牌和邮箱密码登录；本机额外显示“本机测试版”和卡片外的匿名体验入口。密码显示切换、错误重试和登录限流倒计时沿用原有逻辑。

首次准备本机环境，在交互终端执行：

```powershell
npm run beta:init -- --email developer@nearby.test
npm run beta:dev
```

访问 `http://localhost:3130`。初始化复用本机 PostgreSQL 工具，独立保存数据于 `.local/nearby-beta/`，数据库为 `127.0.0.1:55440/nearby_beta_local`。找不到工具时设置 `NEARBY_POSTGRES_BIN` 为 PostgreSQL bin 目录。首次初始化从服务端配置导入已有高德 Key 到开发者账号，后续初始化保留账号、密码及 Key；普通内测账号首次登录自行配置 Key。初始密码仅在交互终端展示一次。

```powershell
npm run beta:account -- create --email friend@example.test
npm run beta:account -- reset-password --email developer@nearby.test
npm run beta:account -- disable --email friend@example.test
npm run beta:stop
```

重置密码撤销旧会话；停用账号后登录、业务接口及高德最终准入均拒绝该账号。停止及重启保留数据。私有配置包含数据库密码和凭证加密密钥，需妥善备份并保持当前用户私有权限；加密密钥与数据库分别备份。

线上部署模板为 [private-beta 配置](config/private-beta.env.example.json)，将变量逐项写入部署平台，使用独立内测数据库及实际 HTTPS 地址。模板中的占位值需要替换；生产运行使用 `private-beta`。账号管理可显式指定私有配置：

```powershell
npm run beta:account -- create --email friend@example.test --env-file .local/nearby-beta-remote/environment.json --confirm-target db.example:5432/nearby_beta
```

管理配置中的 DATABASE_URL 和 DIRECT_URL 使用同一明确直连目标；命令展示脱敏目标，要求精确确认。执行远程账号管理前先完成该目标的备份与 `prisma migrate deploy --config prisma7.config.ts`。实际远程配置、迁移及部署需按明确目标安排。平台默认地址、Preview 与自定义域名使用相同访问保护。当前 IP 识别适配 Vercel，其他代理环境需另行适配。

实现、迁移与实际验收结果见[内测版交付记录](harness/build/2026-11-07-private-beta.md)。

## 本地运行

使用 **Node.js 24**（与 CI 一致）、npm、高德 Web Service Key 和可访问的 PostgreSQL。依赖版本以 `package-lock.json` 为准，当前为 Next.js 16.4.5、React 19.2.0、Prisma 7.10.1、TypeScript 5.9.3。

在仓库根目录操作；首次配置时从示例创建 `.env`，已有文件则直接编辑，保留原配置：

```powershell
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
```

填写以下服务端变量，不要提交真实值：

| 变量 | 用途 |
| --- | --- |
| `AMAP_WEB_SERVICE_KEY` | 匿名体验的公共 Key，只在服务端使用 |
| `DATABASE_URL` | 应用历史使用 Prisma PostgreSQL adapter，准入使用独立 pg 池；均读取此运行连接 |
| `DIRECT_URL` | `prisma7.config.ts` 中的 Prisma CLI 数据源；迁移使用直连地址，本地可与上项相同 |
| `BETTER_AUTH_URL`、三个独立签名／指纹密钥 | 身份会话与固定来源，完整变量名见 `.env.example` |
| `NEARBY_CREDENTIAL_KEYS`、`NEARBY_CREDENTIAL_KEY_VERSION` | 账户高德 Key 的版本化加密密钥环 |
| `SMTP_*` | 验证邮件和密码找回投递 |

安装阶段严格应用三份 Lint 兼容补丁，再按 `prisma7.config.ts` 生成客户端；补丁失配会使安装失败。补丁版本、原因和移除条件见 [patches/README.md](patches/README.md)。项目级 `allowScripts` 固定允许 Prisma 引擎／CLI 与 esbuild 的安装脚本。2026-11-05 完整依赖审计为零告警，验证详情见[交互与依赖更新记录](harness/build/2026-11-05-identity-interaction-dependency-update.md)。

安装锁定依赖并生成客户端：

```powershell
npm ci
npx prisma generate --config prisma7.config.ts
```

对**指定的本地开发数据库**应用仓库已有迁移，再启动页面：

```powershell
npx prisma migrate deploy --config prisma7.config.ts
npm run dev
```

打开 [本地页面](http://localhost:3000)。迁移命令会修改目标数据库结构；线上迁移和发布按具体任务授权执行。`npm ci` 的 postinstall 已显式执行 `prisma generate --config prisma7.config.ts`；单独命令可用于重新生成客户端。

Next.js 会加载根目录 `.env*`；`prisma7.config.ts` 通过 `dotenv/config` 加载 `.env`。CLI Spike 脚本自身不加载 `.env`，需要进程环境变量。Web 构建导入历史数据库模块时需要有效格式的 `DATABASE_URL`；隔离构建可使用测试说明中的 localhost 占位值，不能据此认为真实数据库已验证。

高德准入池有独立的连接准备阶段：Next Node 实例通过 `instrumentation.ts` 启动预热，请求在预约前共享准备任务；POI 联合查询 CLI 在取得本轮预算锁前完成预热。准备只执行 `SELECT 1`，成功后开始原有 2 秒准入计时。普通 Prisma 连接固定使用 UTC，保持会话及带时区字段的一致性。本地常驻与 Vercel 生命周期设计见 [预热实现说明](harness/build/2026-10-28-admission-database-warmup.md)。

## 检查与测试

```powershell
npm test
npm run check
npm run build
```

| 命令 | 实际范围 |
| --- | --- |
| `npm test` | 高德出口 AST 门禁、核心及历史 Route 测试编译、Node.js 测试、AST 门禁正反例；不调用真实高德或 PostgreSQL |
| `npm run check` | 核心 TypeScript 检查、Next 路由类型生成及 Web TypeScript 检查 |
| `npm run build` | 核心编译和 Next.js webpack 生产构建 |
| `npm run check:boundary` | 单独检查生产代码是否绕过统一高德传输出口 |

测试分层、定向执行和浏览器夹具说明见 [test/README.md](test/README.md)。这些命令会产生 `dist/`、`.next/` 或类型缓存；严格只读任务不要执行。CI 仅对面向 `master` 的 PR 和 `master` push 运行安装、test、check、build，并增加身份 PostgreSQL／SMTP、Chromium E2E 和 ESLint。

### 真实 API 调研

以下命令会消耗高德额度，需要单独确认调用范围；不属于 `npm test`：

```powershell
$env:AMAP_WEB_SERVICE_KEY = "你的 Web Service Key"
npm run smoke -- "深圳北站"
```

不传地点时默认测试深圳北站和香港城市大学，半径 3 km；对比 keyword-only、types-only，并对酒店/健身房/甜品追加 keyword-and-types 实验。这是保留的策略比较工具；**产品当前 10 类均使用 `types-only`**，配置集中在 [src/amap/categories.ts](src/amap/categories.ts)。`resolver:spike`、`resolver:address-micro`、`result-card:spike`、`result-card:photo-review` 同样属于真实 API 调研，不要当作隔离检查运行。香港输入会额外核对地理编码的行政区，明显不匹配时跳过周边查询；地区覆盖受高德数据和权限限制。

## 代码入口与 API

| 位置 | 职责 |
| --- | --- |
| `app/page.tsx`、`src/web/SearchApp.tsx` | 搜索页面与交互，取消旧请求并防止过期响应覆盖 |
| `src/web/CategoryResults.tsx`、`src/web/SearchPanels.tsx`、`src/web/ui/` | 分类结果框、地点卡、工作台布局和统一反馈组件 |
| `src/web/search-history-store.ts`、`src/web/useSearchHistory.ts` | 历史缓存、读取、保存、删除及 UI 状态 |
| `src/location/` | 地点意图路由、候选解析、地址归一化 |
| `src/search/` | 搜索请求校验、类别编排、结果状态和排序 |
| `src/amap/transport.ts` | 统一高德网络出口、超时、限读及安全错误 |
| `src/server/` | Route 生命周期、策略配置和服务端高德工厂 |
| `src/history/`、`src/db/`、`prisma/` | 账户历史服务、Prisma 访问、模型及迁移 |
| `scripts/`、`test/`、`.github/workflows/ci.yml` | 调研脚本、隔离测试及 CI |

| API | 方法与输入 | 行为 |
| --- | --- | --- |
| `/api/resolve-location` | POST：`query` | 返回确认地点、候选或未找到 |
| `/api/search` | POST：`center`、`resolvedLocation`、`categoryIds`、`radiusMeters` | 每类查询第 1 页，单页 25 条；使用确认坐标；支持 NDJSON 逐类进度 |
| `/api/search/page` | POST：`center`、`categoryId`、`radiusMeters` | 指定单类别查询第 2 页，单页 25 条 |
| `/api/history` | GET：可选 `limit=10` 或 `20`；POST：`query`、`categoryIds`、`radiusMeters`、`confirmedLocation`；DELETE：`id` | 读取/保存/删除当前已登录账户历史，使用 `private, no-store` |

搜索页面请求 `/api/search` 时使用 `Accept: application/x-ndjson`。响应按行发送 JSON：`progress` 包含 `progress.results`（已返回类别）、`active`（搜索中）、`pending`（等待）及可选 `termination`；`complete` 包含最终 `response: SearchResponse`；`error` 包含安全的 `error.message` 和可选 `code`。流以一条 `complete` 或 `error` 结束；请求校验及初始化错误在开启流前返回原 HTTP JSON 错误。普通 JSON 调用沿用完整 `SearchResponse`。

类别框展开先显示10条，按10→20→25→35→45→50分段展示；分页继续沿用每页25条、最多两页。搜索过程中可展开、排序和浏览已返回类别；整轮结束后开放第2页。中途更改地点或条件会取消旧搜索；意外断流保留已返回地点，并提示重新搜索。整轮完成且有已完成类别时保存一次历史。

精确字段及限制以 `src/location/types.ts`、`src/search/contracts.ts`、对应 validator 和 `src/history/contracts.ts` 为准。`/ui-preview` 是保留的导航视觉预览入口，不是正式搜索页面。

## 搜索与请求安全约定

类别按请求顺序串行调用，下一类在上一类完成后立即进入准入；不自动重试。单次 HTTP 超时、普通上游错误及 `ADMISSION_WAIT_EXCEEDED` 记录为单类失败并继续；全部类别失败返回 `ALL_CATEGORIES_FAILED`。额度、认证或准入数据库故障停止后续共享同一 `nearby` 操作和凭据的类别，已有结果继续返回。整体期限耗尽时返回已完成结果、超时类别及其余 `skipped` 类别；尚无完成结果时返回 504。主动取消沿用 499。

时间计算、父子预算、取消传播和可取消等待统一复用 `src/amap/request-context.ts`。默认总期限 60s，准入最多 2s，准入后的单次 HTTP 最多 8s；子期限取本层上限与父剩余时间的较小值。数据库连接、SQL、锁及驱动保护继续受剩余准入时间约束。数据库预约等待从响应接收后计算：v1 函数会拒绝提前到达，跨主机时间与网络方向未知时保留这段等待；产品搜索的固定 500ms 间隔已删除。独立 smoke CLI 和 POI 调研脚本保留自身节流策略。完整责任表及验证见 [时间与失败治理交付记录](harness/build/2026-10-29-time-and-failure-governance.md)。

长期原则：业务模块声明自身的超时需求和失败策略；时间计算、取消传播及终止决策通过可复用基础能力协调。准入负责共享资源的预约与放行，搜索调度器依据错误性质、影响范围和当前可用能力决定后续类别。

高德请求显式使用 `sortrule=distance` 和 `show_fields=business`。`distanceMeters` 优先使用有效的高德距离，否则使用 Haversine 直线距离；`computedDistanceMeters` 始终保留。距离不是步行或驾车路线距离。消费、评分、标签等缺失值为 `null`，展示与消费排序按类别限制。

三个高德 POST Route 已接入统一生命周期、安全错误和入站 JSON 限制。高德密钥、完整请求 URL 和原始上游错误正文不返回浏览器；历史接口沿用自身协议，不适用这三个 Route 的限读与取消约定。

候选时限、字节限制及已知残余风险统一维护在 [PLANS.md](PLANS.md)。`vercel.json` 对三个高德 Route 声明了 `supportsCancellation: true`；配置和本地测试通过不能替代真实 Vercel 客户端断连的端到端验证。

### 公共 Key 的既有 PostgreSQL 准入

公共 Key 的 V1 准入流程为：原子预约时间 → 事务外可取消等待 → 最终事务原子更新日/月用量、消费水位和速率许可 → 提交确认并检查许可新鲜度 → 高德请求。无自动高德重试，无额度返还。若前一许可导致预约稍早到达，至多额外等待并检查一次，不循环轮询。准入总时限最多 2 秒，且不超过业务剩余期限。

`AmapResource` 每行对应一个已核实的共享额度／速率范围；`AmapOperationBinding` 把服务端逻辑凭据与 `geocode`、`poi-text`、`nearby` 操作绑定到资源。`AMAP_CREDENTIAL_ID` 默认为 `primary`，公共 Key 继续保存在 `AMAP_WEB_SERVICE_KEY`；账户 Key 使用下节的加密凭证表。V1 公共资源配置继续独立维护。额度与速率共享范围不同的官方资源不能强行合并为一行，需在启用前确认映射是否适用。

迁移 `20261027000000_amap_admission` 只创建结构，不初始化真实政策。**迁移后没有已启用资源／操作绑定时，相关请求会返回安全的 503，不绕过保护。** 启用前须明确目标数据库，为每个实际使用的操作配置绑定，并显式填入已确认的 `dailyLimit`、`monthlyLimit`。不能把参考配额当成账号实测值。

表中默认 500ms 许可间隔、2000ms 等待上限、300ms 预约迟到窗口和 200ms 许可有效期均为待部署验证的候选；资源默认禁用。数据库触发器在政策修改时递增版本、使旧预约失效并保留保守速率屏障；不支持清空状态、删除重建 scope 或绕过协议在线重置。暂停／删除操作绑定等管理操作需受控执行，第一版没有管理接口。

日/月按上海时区在最终准入时懒更新，不需要定时重置。额度用完提供 429、稳定错误码和 `retryAt`；跨周期后下一次请求重新判断。单次解析、第二页或尚无已完成结果的共享故障，沿用原有安全错误协议。多类别搜索中的准入等待超时记录到对应类别后继续；额度与数据库故障停止当前共享链路，已有结果通过 200 部分成功返回。已经完成的调用不退款；前端显示安全消息，保留结果并限制未执行类别的翻页。

准入使用独立的有界 `pg` 池，历史池沿用原配置。预约和放行分别调用 `amap_admission_reserve_v1`、`amap_admission_grant_v1`；每个阶段独占连接，一次流水发送 BEGIN、事务内限时设置、参数化函数调用及 COMMIT，全部结果排空并确认 COMMIT 后返回许可。正常路径共两个批次，等待期间归还连接；遇到一次就绪复查时增加一个放行批次。

池最多 4 连接，物理建连上限 8 秒；借用连接上限 600ms，服务端 SQL 800ms、锁等待 150ms、空闲事务 800ms、驱动读取 1200ms，均按剩余准入期限缩短。原有总准入 2 秒及资源策略保持原值。每实例／逻辑凭据至多 12 个未完成准入；执行器对尚未结算的连接申请也设 12 个上限，超时／取消后的迟到连接统一归还。已派发批次在后台排空，连接结果异常时销毁，取消后停止高德发送，已提交扣额按保守消耗处理。

部署顺序为先应用函数迁移，再发布应用；`20261029000000_amap_admission_slot_alignment` 更新预约函数，使预约时刻同时遵守预约队列和实际放行屏障，保留计数、绑定及策略触发器。旧调用协议继续有效，恢复旧应用时保留函数和账本。各次实现及验证见 [短事务交付记录](harness/build/2026-10-28-admission-functions.md) 与 [时间及失败治理记录](harness/build/2026-10-29-time-and-failure-governance.md)。

事务失败通过单条 `admission.failed` 汇总诊断：`attemptId` 关联一次准入的预约和放行，`statements` 记录四条 SQL 的客户端提交／结果返回时间、状态及安全错误分类，`readTimeoutMs` 记录实际读取上限，`functionToCommitMs` 记录函数返回至提交结果到达的间隔。提交确认使用 `commitAck` 四种状态表达，连接处理记录销毁请求；成功路径保持静默。字段含义、验证及本地交付状态见[事务诊断记录](harness/build/2026-10-29-admission-transaction-diagnostics.md)。

放行阶段分开计算操作有效窗口与提交确认等待：借连接、SQL 和最终许可继续受预约／总准入剩余时间约束；驱动结果读取使用总准入剩余时间，上限仍为 1200ms。明确收到 COMMIT 后若预约已过期，返回 `ADMISSION_WAIT_EXCEEDED`，该类别停止发送，后续类别按既有策略继续；已提交额度沿用保守消耗。确认仍未到达时保持提交不明的处理。失败日志同时记录 `completionRemainingMs` 以及 `reservation` 的预约耗时、有效期、计划等待及实际等待时长。复现与本地修复验证见[提交确认窗口记录](harness/build/2026-10-29-admission-commit-window.md)。

数据库协调的是许可时间，不能证明高德接收端严格 2 QPS。取消发生在提交后可能损耗内部预算，时隙取消后留空；数据库故障切换、时钟跳变和真实 Vercel 断连仍需部署环境验证。现有 CLI Spike 继续用于显式授权的独立调研，走统一 transport，但不自动连接 Web 的数据库准入；启用保护后的额度核算要求避免这些工具或其他应用在池外使用同一 Key。

## 文档分工

- [README.md](README.md)：现有功能、安装运行、代码入口和检查命令。
- [AGENTS.md](AGENTS.md)：协作规则与开发边界。
- [PLANS.md](PLANS.md)：当前状态、待办、风险和阶段约束；顶部现状优先于历史快照。
- [test/README.md](test/README.md)：测试覆盖、执行方式与证据边界。
- [harness/build-log.md](harness/build-log.md)、[harness/build/](harness/build/)：按日期保留的决策与验证证据，不代表实时部署状态或新的操作授权。

修改功能、环境变量或命令时，同步对应说明；状态变化更新 PLANS 顶部，历史报告通过带日期的补充说明纠正，不把旧验收改写成新验收。


## 双身份与 BYOK（2026-11-04，本地实现）

首次访问选择匿名体验或注册／登录。账户完成邮箱验证后启用，Session 七天、一天更新；密码找回成功后撤销旧会话。SMTP 在生产强制 TLS。所有写接口使用固定的 `BETTER_AUTH_URL` 来源校验。

Guest 使用平台 Key：每身份每日默认 60 次最终准入、北京时间零点重置；解析、类别与翻页均计数，准入成功后的网络失败和取消保留计数。体验会话 30 天，独立签名限额标识一年；退出撤销会话并清除本地历史，当天重新进入继续累计。IP 保护采用服务端可信地址，日志与计数标识使用 HMAC。

Account 每账户一条高德 Web Service 凭证，AES-256-GCM 加密并以 userId／加密版本绑定；保存不调用高德，首次业务成功后标记已验证。账户 Key 的日／月额度由上游处理，应用仅治理速率和并发。相同 Key 共享指纹速率；跨实例租约覆盖请求与响应读取，默认全局 12、每身份 2。账户凭证状态与平台 Key 配置分别处理。

新增接口：`/api/auth/*`、`/api/identity`、`/api/guest/session`（POST／DELETE）、`/api/guest/usage`（GET）、`/api/account/amap-credential`（GET／PUT／DELETE）。凭证 PUT 仅接受 `{key}`，保存与删除要求最近 15 分钟内登录。身份切换时重建工作区；浏览器请求携带 `x-nearby-session`，服务端核对当前已验证会话，拒绝迟到请求。请求身份始终取自有效 Cookie／Session。

环境配置见 `.env.example`。将独立随机值填入三个签名／指纹密钥；使用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 在自己的终端生成 AES 密钥，再填入 `NEARBY_CREDENTIAL_KEYS`。密钥环保留旧版本供解密，更新当前版本后先执行 `npm run credentials:rotate` 预检，核对目标库后用 `npm run credentials:rotate -- --apply` 执行轮换。输出仅包含计数。

数据库采用增量迁移：`npx prisma migrate deploy --config prisma7.config.ts`。运行前确认 `DIRECT_URL` 指向本次授权目标并完成备份；本次只在临时测试库执行迁移。旧访客数据、公共资源配置及 V1 准入函数保留。完整架构、迁移顺序、模块清单、验证结果与回退说明见 [双身份实施记录](harness/build/2026-11-04-dual-identity-byok.md)。
