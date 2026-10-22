# Nearby · 地点探索工作台

当前阶段由 [Issue #7](https://github.com/JKd121/nearby-places/issues/7) 定义，在 [PR #5](https://github.com/JKd121/nearby-places/pull/5) 的四页面外壳上先重构 Explore 交互，再精简视觉。保留既有地点解析、类别/半径选择、筛选排序、分页、历史保存及原中心回放；不接入真实地图、认证或收藏后端。

| 路由 | 功能 |
| --- | --- |
| `/` | 开始探索、当前访客最近三条探索 |
| `/explore` | 固定工作区、候选/条件/历史弹层；桌面列表与地图占位并列，手机底部结果面板可收起 |
| `/my-places` | 诚实的收藏未开放状态与探索/历史入口 |
| `/history` | 最近十条完整历史、重试、删除、按原条件继续探索 |

Home/History 的继续链接只携带历史记录 ID。Explore 从当前访客的最近记录中读取并校验后，复用原搜索流程。过期/已删除/其他访客记录提示无法恢复，不猜测原中心。Explore 顶部历史按钮可打开最近记录并恢复搜索。历史全文检索、完整分页、账户同步属于后续范围。

样式使用 Tailwind v4 构建与共享 CSS tokens；当前工作区样式位于 `app/explore.css`，`app/search.css` 是未加载的历史样式。弹层复用现有 Radix Dialog，未增加生产依赖。shadcn/ui 的裁剪适配与许可见 `THIRD_PARTY_NOTICES.md`。

## 运行环境

- Node.js 24（与现有 CI 一致）
- 高德 Web Service API Key
- 实际历史持久化需要已有 PostgreSQL 连接；本阶段不创建环境文件或执行迁移

```powershell
npm install
$env:AMAP_WEB_SERVICE_KEY = "你的 Web Service Key"
npm run smoke
npm run dev
```

默认测试 `深圳北站` 和 `香港特别行政区九龙达之路香港城市大学`，半径为 3,000 米。Smoke 会对每个地点比较 keyword-only baseline 与 types-only candidate，并追加酒店、健身房、甜品的 keyword-and-types 最终实验；也可以传入其他地点名称：

```powershell
npm run smoke -- "深圳北站"
```

Key 只在服务端从 `AMAP_WEB_SERVICE_KEY` 读取。Next.js 按框架规则加载本地环境文件；独立 Node smoke 脚本需显式注入变量。不要将凭据放入公开变量或提交 Git。

## 验证命令

```powershell
npm test
npm run lint
npm run check
npm run build
```

`npm run dev` 启动页面；搜索入口为 `/explore`。浏览器调用 `/api/resolve-location` 完成地点解析，确认后调用 `/api/search`。延续基线默认选择全部 10 类和 3 km，支持 1/2/3/5 km、类别分组、过滤、排序及第二页结果。搜索直接使用已确认中心，不会再次 geocode。

### 隔离浏览器验收

不连接真实数据库或高德。使用真实 production UI 与历史 route/service/repository，在数据库和 Provider 边界提供隔离内存/合成数据。需要本地 Google Chrome；测试使用 3187/3188 端口，无现成服务时自动启动并在结束后停止。

```powershell
$env:DIRECT_URL = "postgresql://ci:ci@localhost:5432/nearby_ci"
$env:DATABASE_URL = $env:DIRECT_URL
npm ci
npm test
npm run check
npm run build
npm run test:browser
```

占位连接仅满足生成/构建配置，不建立数据库。`npm run lint` 使用 ESLint、TypeScript 和 React Hooks 规则检查前端及浏览器测试，未覆盖历史 CLI Spike。桌面 1440×900、手机 390×844、平板 820×1180 的本轮前后截图位于 `harness/build/issue-7-evidence/before/` 和 `after/`；旧 Issue #4 证据保留。地点/历史结果截图均为明确的测试夹具，不代表真实高德结果或数据库验收。完整记录见 `harness/build/2026-10-23-issue-7-explore.md`。

14 项浏览器测试覆盖候选有界滚动/确认/修改、折叠条件保留、移动底部面板与首屏几何、加载/无结果/错误、过期请求、筛选/四种排序、本地展开/Provider 第二页失败重试、高德链接、历史保存/恢复/刷新/删除，以及键盘焦点。使用生产构建；修改 UI 后必须重新 build 再运行测试。可用进程变量 `BROWSER_EVIDENCE_DIR` 指定截图目录，避免覆盖历史证据。

## 距离与商业字段说明

请求显式使用 `sortrule=distance` 和 `show_fields=business`。标准模型始终计算 Haversine 距离；若 AMap 返回有效的 native `distance`，`distanceMeters` 使用该值并标记 `distanceSource=amap`，否则使用 computed fallback 并标记 `computed`。`computedDistanceMeters` 始终保留。computed 值是本地直线距离，不是高德 API 原生字段，也不是步行或驾车距离。

`business.cost`、`business.rating`、`business.tag` 缺失时统一输出 `null`。高德主要为美食 POI 返回 `tag`，主要为餐饮、酒店、景点、影院返回 `rating`/`cost`，因此其他类别缺失并非错误。

香港城市大学仅用于能力验证。普通 Key 可能遇到地区、数据或权限限制；程序保留高德响应中的 `info` 和 `infocode`，不会改用其他数据源绕过。

八个类别按配置顺序逐一请求，相邻 Around 请求之间等待约 500ms；单个类别失败仍会继续下一类。输入包含“香港”但地理编码结果的地址和行政区均不含“香港”时，Smoke Test 会报告 `geocode validation failure` 并跳过该错误坐标的周边搜索。

类别的 AMap typecode、关键词、候选搜索策略和 cost 语义集中在 `src/amap/categories.ts`。当前 `types-only` 只是待真实数据比较的候选，不预设为最终策略；Smoke 输出每类请求策略、请求 type(s)、返回 POI `type`/`typecode`、baseline 与 candidate 前 10 名和数量差异。最终策略可按类别独立选择 `types-only`、`keyword-and-types` 或 `keyword-only`。

产品核心契约位于 `src/search/`：请求只接受地点、预设类别 id 和四个允许半径；服务默认每类请求 page 1/25，并返回每类别独立的 success/empty/error 与 AMap `info`/`infocode`。`src/search/sort.ts` 提供不修改原数组的距离、评分和受限 cost 排序。

## 范围

本阶段只交付 Issue #7 的 Explore 交互重构及授权页面视觉精简。真实地图及联动、认证、收藏与清单持久化由后续独立 Issue 处理。当前 PR 不修改 API、Schema、迁移或 CI/Preview 触发规则。
