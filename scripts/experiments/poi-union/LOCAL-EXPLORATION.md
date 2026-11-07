# 本地多类别真实数据探索 V1

## distance / weight 小对照（另行授权的 6 次）

2026-10-28 用户授权排序小对照：沿用原私有三地点和全部 10 类，每地点各查 distance、weight 一次，共 6 次；site-1/3 先 distance，site-2 先 weight。半径、types、page_size=25、page_num=1、show_fields 均一致。该回合与下方原 V1 的 9 次分别记账。

```powershell
npm run experiment:poi-union:sort
npm run experiment:poi-union:sort -- --mode mock
npm run build:core
node --env-file=.env dist/scripts/experiments/poi-union/sort-comparison.js --mode live --config .local/poi-union-v1/config.json --authorize-sort-live-6
```

排序回合默认 Dry；Live 使用专属授权标记。固定预算目录 `.local/poi-union-v1/sort-comparison-v1/` 的 `sort-comparison.lock` 以 wx 独占创建，最多六次 HTTP，发送前追加并 fsync `sort-attempts.jsonl`，重复执行被拒绝。原 V1 的锁、日志和报告保持原状。

复用本地许可、500ms 间隔、统一传输、分类统计及安全错误；普通上游失败后继续，认证、限额、取消或本地存储异常停止。无数据库、重试、翻页或额外调用。报告版本 `poi-union-sort-v1`，位于忽略目录 `reports/sort-<mode>-<时间>-<uuid>/`，记录每项排序规则、配对覆盖变化、每类条数、头部类别/原始编码占比、未确认码及响应耗时。

每地点每种排序仅一次，连接复用/缓存/时间波动会影响比较。明确类别覆盖仍依赖现有精确分类规则，未确认子编码另外展示。本回合用于观察排序效果，后续分组或补查实验需另行安排。

以下为原 V1 本地探索的授权与用法记录。

2026-10-28：用户将优先级调整为获取真实多类别返回，明确授权本地实验跳过 PostgreSQL 准入、记录普通上游错误后继续下一项。分支为 `Nearby-多类别真实数据探索-V1`；生产搜索仍沿用现有入口。

## 运行

```powershell
npm run experiment:poi-union:local
npm run experiment:poi-union:local -- --mode mock
npm run build:core
node --env-file=.env dist/scripts/experiments/poi-union/explore.js --mode live --config .local/poi-union-v1/config.json --authorize-local-live-9
```

默认 Dry；Mock 使用合成响应。Live 只读取 `AMAP_WEB_SERVICE_KEY` 及私有地点配置，不导入数据库、服务端准入或预热模块。运行前关闭原 Live 实验进程。沿用既有三地点、3/5/10 类、1000m 本地半径配置、25 条第一页和统一响应字段。各请求串行，后续请求在本地许可阶段等待 500ms。接口超时及响应体限制复用统一传输层；无重试、翻页、额外查询或自动补跑。

## 预算接管

原 Live 在 PostgreSQL 失败处停止，高德调用为 0，保留 `live-budget.lock`。本地入口仅接管完全未使用的 V1 预留：锁必须是 version=poi-union-v1、reserved=9、calls=0，且 `live-attempts.jsonl` 尚不存在。首次使用且没有预留时建立原锁。

接管另外以 `wx` 创建固定 `local-exploration.lock`，保留原锁，并在每次 HTTP 前 fsync 写入原 `live-attempts.jsonl`。两个入口的重复运行均被拒绝；最多 9 次，任何已存在的尝试日志（包括空日志）均拒绝接管。中断/失败保留锁，剩余项目不自动补跑。锁属于当前 checkout 的本地实验控制；本次并未执行数据库额度扣减或分布式 QPS 校验。

## 错误及报告

网络/接口超时、普通 HTTP 及响应格式错误沿用现有 recover 分类，记录后继续下一项目。认证、额度或限流、取消、本地预算/存储及未知错误停止。高德限流/余额码按[官方错误码表](https://lbs.amap.com/api/webservice/guide/tools/info)在实验层识别，生产错误分类保持原状。

JSON/Markdown 输出到 `.local/poi-union-v1/reports/local-<mode>-<时间>-<uuid>/`。`executionControl=local-exploration`、`admission=local-budget` 明确记录本地控制方式。`completed` 表示已遍历计划，各行 `outcome` 记录真实成败；存在失败时 CLI 退出码为 1。

每项保存类别/编码分布、未确认编码、HTTP 与业务状态、总耗时及响应耗时。`admissionMs` 在此入口包含本地 500ms 间隔，`responseMs` 从发出 HTTP 到读取/校验完成。只保存聚合，无 Key、数据库连接串、真实坐标、完整 URL 或完整响应。

重点观察类别覆盖随 3/5/10 类的变化、第一页触顶及响应耗时。父子编码仍按原实验明确规则归属，未知子编码保持未确认。某类 0 个明确匹配应结合原始编码聚合解释。独立类别对照尚未运行，费用及相对加速仅能在后续对照中测量；本轮 9 个样本用于探索。

## 实现与验证记录

- `explore.ts`：本地独立 CLI 与局部许可；`exploration-budget.ts`：未使用预算的一次性交接。
- `runner.ts`：显式选择本地模式时采用继续策略；原实验入口仍遇错停止。
- `report.ts`：标记执行方式及本地计时含义。
- `test/poi-union-exploration.test.ts`：数据库/原生网络禁止下的 Dry/Mock、错误继续、取消、存储失败、次数及跨进程排他验证。
- 实际运行证据见 `harness/build/2026-10-28-poi-union-local-exploration.md`。
