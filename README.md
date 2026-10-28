# 高德地点周边数据能力 Spike

## 搜索部分结果与错误处理

多类别搜索中，单类别可恢复的上游错误不阻止后续类别；准入、额度或认证问题会停止后续调用，已有完成类别时返回部分结果并将未执行类别标记为 skipped。取消与整体截止时间仍终止请求。搜索历史仅在至少一个类别完成时保存，失败或未执行类别不能请求第二页。

诊断接口提供 `search.stopped` 事件，记录公开停止码、类别、已完成和未执行数量；Route 当前未接入诊断记录器，不能将接口存在当作线上日志已经开启。

这是一个最小 Node.js + TypeScript + Next.js App Router 产品化骨架：保留 v0.1A 的 AMap 搜索核心，并提供两阶段“解析地点 → 用户确认 → 周边搜索”页面和服务端 API。v0.1B-2A 已加入类别/半径选择、本地过滤、排序、去重和加载更多；最终视觉精修仍未实现。

## 运行环境

- Node.js 18 或更高版本（需要原生 `fetch`）
- 高德 Web Service API Key

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

Key 只从 `AMAP_WEB_SERVICE_KEY` 环境变量读取；项目不会自动加载 `.env`。`.env.example` 仅说明变量名。

## 验证命令

```powershell
npm test
npm run check
npm run build
```

`npm run dev` 启动页面；浏览器调用 `/api/resolve-location` 完成地点解析，确认后调用 `/api/search`。页面默认选择 8 类和 3 km，也支持 1/2/3/5 km、类别分组、结果过滤、排序和本地加载更多。AMap Key 只在服务端从 `AMAP_WEB_SERVICE_KEY` 读取，浏览器请求不会携带 Key。搜索请求直接使用已确认的中心坐标，不会再次 geocode。

## 距离与商业字段说明

请求显式使用 `sortrule=distance` 和 `show_fields=business`。标准模型始终计算 Haversine 距离；若 AMap 返回有效的 native `distance`，`distanceMeters` 使用该值并标记 `distanceSource=amap`，否则使用 computed fallback 并标记 `computed`。`computedDistanceMeters` 始终保留。computed 值是本地直线距离，不是高德 API 原生字段，也不是步行或驾车距离。

`business.cost`、`business.rating`、`business.tag` 缺失时统一输出 `null`。高德主要为美食 POI 返回 `tag`，主要为餐饮、酒店、景点、影院返回 `rating`/`cost`，因此其他类别缺失并非错误。

香港城市大学仅用于能力验证。普通 Key 可能遇到地区、数据或权限限制；程序保留高德响应中的 `info` 和 `infocode`，不会改用其他数据源绕过。

八个类别按配置顺序逐一请求，相邻 Around 请求之间等待约 500ms；单个类别失败仍会继续下一类。输入包含“香港”但地理编码结果的地址和行政区均不含“香港”时，Smoke Test 会报告 `geocode validation failure` 并跳过该错误坐标的周边搜索。

类别的 AMap typecode、关键词、候选搜索策略和 cost 语义集中在 `src/amap/categories.ts`。当前 `types-only` 只是待真实数据比较的候选，不预设为最终策略；Smoke 输出每类请求策略、请求 type(s)、返回 POI `type`/`typecode`、baseline 与 candidate 前 10 名和数量差异。最终策略可按类别独立选择 `types-only`、`keyword-and-types` 或 `keyword-only`。

产品核心契约位于 `src/search/`：请求只接受地点、预设类别 id 和四个允许半径；服务默认每类请求 page 1/25，并返回每类别独立的 success/empty/error 与 AMap `info`/`infocode`。`src/search/sort.ts` 提供不修改原数组的距离、评分和受限 cost 排序。

## 范围

当前包含 v0.1B-1 基础页面与服务端路由，以及 v0.1B-2A 的功能交互；不包含 v0.1B-2B 最终视觉/响应式/无障碍精修、收藏、地图、数据库、账号或其他产品功能。
