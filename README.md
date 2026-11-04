# 地点周边生活服务聚合器

输入地点、确认搜索中心，按类别和半径查询附近生活服务。项目已从高德 API 能力 Spike 演进为 Next.js 全栈 Web 应用，包含统一搜索工作台、访客历史记录和请求安全基线；早期 CLI 调研脚本仍保留。

## 目前支持

- 地点解析、候选选择及确认后搜索；搜索使用已确认坐标。地址解析后的进一步用户确认及补充信息入口继续跟进 [Issue #6](https://github.com/JKd121/nearby-places/issues/6)。
- 酒店、商场、火锅、面包、甜品、KTV、台球厅、健身房、公交站、地铁站共 10 类，支持分组选择及 1/2/3/5 km 半径。
- 分类结果逐步返回，每类独立结果框默认收起，可同时展开；每类独立排序和分段加载，整轮完成后可手动获取第2页。
- 结果卡展示地址、距离、可用的评分/消费/标签及高德原始营业时间文字，提供高德位置链接。缺失字段不补造，不推断“正在营业”。
- 多类别搜索默认最多两个任务并行，同一搜索的准入排队，HTTP 响应可重叠；类别框按原类别顺序排列，已完成类别即时更新。临时数据库故障逐类记录后继续，额度、认证或明确配置错误停止新增类别；整体截止保留已完成结果，用户取消结束请求。
- 全部类别尝试失败时仍显示完整类别列表、零类完成和逐类失败原因。准入事务独立排空至多 3 秒，确认空闲的健康连接复用，损坏连接从池中移除后替换。
- 最近搜索保存到 PostgreSQL，按访客 Cookie 隔离；支持刷新、删除，以及恢复原确认中心、类别和半径后直接查询新结果。缺少完整确认地点的旧记录保留在数据库，列表不展示。
- 工作空间、最近搜索和静态个人中心，共用加载、空结果、错误和重试组件；设置为无操作占位。

尚未实现账号、跨设备同步、收藏、内嵌地图、POI 照片和公交线路/时刻表。公交与地铁类别目前只查询站点 POI。当前项目状态和待办见 [PLANS.md](PLANS.md)。

## 本地运行

使用 **Node.js 24**（与 CI 一致）、npm、高德 Web Service Key 和可访问的 PostgreSQL。依赖版本以 `package-lock.json` 为准，当前为 Next.js 16.3.3、React 19.2.0、Prisma 7.10.0、TypeScript 5.9.3。

在仓库根目录操作；首次配置时从示例创建 `.env`，已有文件则直接编辑，保留原配置：

```powershell
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
```

填写以下服务端变量，不要提交真实值：

| 变量 | 用途 |
| --- | --- |
| `AMAP_WEB_SERVICE_KEY` | 地点解析及周边搜索；只在服务端使用，不使用 `NEXT_PUBLIC_` 前缀 |
| `DATABASE_URL` | 应用历史使用 Prisma PostgreSQL adapter，准入使用独立 pg 池；均读取此运行连接 |
| `DIRECT_URL` | `prisma7.config.ts` 中的 Prisma CLI 数据源；迁移使用直连地址，本地可与上项相同 |

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

打开 [本地页面](http://localhost:3000)。迁移命令会修改目标数据库结构；线上迁移和发布按具体任务授权执行。`npm ci` 的 postinstall 也会执行 `prisma generate`，显式命令用于指定本仓库的非默认配置文件。

Next.js 会加载根目录 `.env*`；`prisma7.config.ts` 通过 `dotenv/config` 加载 `.env`。`npm ci` 的客户端生成脚本显式选择该配置，缺少 DIRECT_URL 时仅在生成子进程使用 loopback 占位值，安装可在未配置数据库时完成。运行与迁移仍需准备对应环境。CLI Spike 脚本自身不加载 `.env`，需要进程环境变量。Web 构建导入历史数据库模块时需要有效格式的 `DATABASE_URL`；隔离构建可使用测试说明中的 localhost 占位值。

高德准入池有独立的连接准备阶段：Next Node 实例通过 `instrumentation.ts` 启动预热，请求在预约前共享准备任务。准备只执行 `SELECT 1`，成功后开始原有 2 秒准入计时。普通历史连接池沿用原配置。本地常驻与 Vercel 生命周期设计见 [预热实现说明](harness/build/2026-10-28-admission-warmup-pr.md)。

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
| `npm run test:admission:postgres` | loopback 可丢弃 PostgreSQL 集成库，高德使用模拟响应 |
| `npm run test:browser` | Chromium + 最新生产构建，受控 API 的页面回归、手机尺寸及键盘操作 |
| `npm run test:history:integration` | 真实 Next Route／Prisma／独立 PostgreSQL，含浏览器持久化、刷新回放与删除 |
| `npm run check:boundary` | 单独检查生产代码是否绕过统一高德传输出口 |

测试分层、环境准备、固定测试入口与报告说明见 [test/README.md](test/README.md)。这些命令会产生 `dist/`、`.next/`、类型缓存或 Web 测试报告。CI 对所有目标分支的 PR 和 `master` push 运行安装、隔离测试、PostgreSQL 17 集成、类型检查、构建及上述两层 Web 测试，报告保留 7 天。生产 job 在主线 CI 通过后发布。维护流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，需求示例、分工及验收方法见 [Codex 协作指南](docs/codex-workflow.md)。

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
| `src/web/SearchPanels.tsx`、`src/web/ui/` | 结果卡、工作台布局和统一反馈组件 |
| `src/web/search-history-store.ts`、`src/web/useSearchHistory.ts` | 历史缓存、读取、保存、删除及 UI 状态 |
| `src/location/` | 地点意图路由、候选解析、地址归一化 |
| `src/search/` | 搜索请求校验、类别编排、结果状态和排序 |
| `src/amap/transport.ts` | 统一高德网络出口、超时、限读及安全错误 |
| `src/server/` | Route 生命周期、策略配置和服务端高德工厂 |
| `src/history/`、`src/db/`、`prisma/` | 访客历史服务、Prisma 访问、模型及迁移 |
| `scripts/`、`test/`、`.github/workflows/ci.yml` | 调研脚本、隔离测试及 CI |

| API | 方法与输入 | 行为 |
| --- | --- | --- |
| `/api/resolve-location` | POST：`query` | 返回确认地点、候选或未找到 |
| `/api/search` | POST：`center`、`resolvedLocation`、`categoryIds`、`radiusMeters` | 每类查询第 1 页，单页 25 条；使用确认坐标，支持NDJSON流式进度 |
| `/api/search/page` | POST：`center`、`categoryId`、`radiusMeters` | 指定单类别查询第 2 页，单页 25 条 |
| `/api/history` | GET：可选 `limit=10` 或 `20`；POST：`query`、`categoryIds`、`radiusMeters`、`confirmedLocation`；DELETE：`id` | 读取/保存/删除当前访客历史，GET 使用 `private, no-store` |

搜索页面发送 `Accept: application/x-ndjson`，响应按行发送JSON：`progress` 包含 `progress.results`（已返回类别）、`active`（搜索中）、`pending`（等待）和可选 `termination`；`complete` 包含最终 `response: SearchResponse`；`error` 包含安全的错误信息。正常流以一条终结消息结束；开启流前的校验错误使用HTTP JSON错误。普通JSON调用沿用完整 `SearchResponse`。

类别框展开先显示10条，按10→20→25→35→45→50分段展示。搜索期间可查看与排序已返回类别；整轮完成后开放第2页。中途更换地点或条件取消旧搜索，意外断流保留已返回地点并提示重试。[Preview验收记录](harness/build/2026-11-04-category-preview.md)。

精确字段及限制以 `src/location/types.ts`、`src/search/contracts.ts`、对应 validator 和 `src/history/contracts.ts` 为准。`/ui-preview` 是保留的导航视觉预览入口，不是正式搜索页面。

## 请求安全与准入

三个高德 POST Route 使用统一生命周期、超时、安全错误和入站 JSON 限制。业务默认总请求 60s、HTTP 8s、准入 2s，入站 JSON 64KiB、上游响应 1MiB；配置见 src/amap/policy.ts 和 src/server/request-policy.ts。

准入通过独立 pg 池共享连接准备，预约和放行各调用一个数据库函数，等待期间释放连接。已发送批次独立排空最多 3s，事务空闲保护 5s；明确提交及许可有效后才发送高德请求。数据库资源保存共享日／月额度、速率和操作绑定；迁移创建结构，真实政策单独核实并启用，缺少有效绑定返回安全 503。

AMAP_CREDENTIAL_ID 默认 primary，对应 geocode、poi-text、nearby 的资源绑定。首次运行需配置并启用资源；模型见 [schema](prisma/schema.prisma)，初始化背景见 [准入记录](harness/build/2026-10-27-amap-admission.md)。

暂时数据库及单类上游故障保存逐类结果；额度、认证和明确配置错误停止新增任务。已提交扣额按保守消耗处理。事务失败输出固定字段的 admission.failed，成功路径保持静默。最新行为与测试见 [恢复及并行记录](harness/build/2026-10-29-recovery-parallel.md)。

发布先应用兼容函数迁移，再发布应用；应用回退保留函数、资源和额度账本。真实 Vercel 客户端断连及最新版本完整高德验收继续跟进 [Issue #24](https://github.com/JKd121/nearby-places/issues/24)。

## 文档分工

- [README.md](README.md)：现有功能、安装运行、代码入口和检查命令。
- [AGENTS.md](AGENTS.md)：协作规则与开发边界。
- [PLANS.md](PLANS.md)：当前状态、待办、风险和阶段约束；顶部现状优先于历史快照。
- [test/README.md](test/README.md)：测试覆盖、执行方式与证据边界。
- [harness/build-log.md](harness/build-log.md)、[harness/build/](harness/build/)：按日期保留的决策与验证证据，不代表实时部署状态或新的操作授权。

修改功能、环境变量或命令时，同步对应说明；状态变化更新 PLANS 顶部，历史报告通过带日期的补充说明纠正，不把旧验收改写成新验收。

维护流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，发布索引见 [GitHub Releases](https://github.com/JKd121/nearby-places/releases)。联合查询实验的独立成果见 [Issue #27](https://github.com/JKd121/nearby-places/issues/27)。

自动验收：`npm run test:acceptance` 依次构建、验证服务端接口模拟及浏览器交互；单独接口入口为 `npm run test:api`。报告、截图和请求记录见 [测试指南](test/README.md)。
