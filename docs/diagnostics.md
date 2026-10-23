# Nearby Diagnostics v1：Stage A 操作手册

仅观测。需求：[Issue #14](https://github.com/JKd121/nearby-places/issues/14)。Stage A 结束后等待人工诊断与 Stage B 授权；本版本没有性能优化结论。真实采样尚未执行。

## 开启与关闭（Preview）

1. 打开 Draft PR 的 Vercel Preview，核对部署 commit 与 PR head 一致。不要使用正式域名做本轮诊断。
2. Vercel 项目 → Settings → Environment Variables：添加 `PERF_LOG_ENABLED=true`，**只选择 Preview，建议再限定 `perf/search-observability` 分支**。不要选择 Production；不要更改共用的高德 Key、数据库或其他变量。本任务只提供操作说明，没有替你修改环境变量。
3. 重新部署该分支的 Preview。环境变量是部署时快照，修改后不会对已有部署动态生效。确认部署详情显示正确 commit 和 Preview 环境。
4. 默认缺省/`false`/其他值均关闭；只有精确的小写 `true` 开启。详细日志只在服务端，变量不能使用 `NEXT_PUBLIC_` 前缀。
5. 结束后将该 Preview 范围设为 `false` 或删除本变量，再重新部署，验证成功请求不再输出阶段日志。保留脱敏错误日志是预期行为。

没有 Vercel 设置权限时，由项目维护者执行 2–3。Preview 已部署但开关未开启，不代表日志接入失败。

## 查看与关联

1. Chrome DevTools → Network → Preserve log；在 Preview 页面先解析地点，确认候选，再搜索。不要并发开启多个采样页面。
2. 浏览器每次新解析或历史回放生成新的 UUID v4，在两条目标 POST 的 `x-diagnostic-session-id` 请求头传递；只存在页面内存中，不持久保存，也不参与认证。复制该头用于记录会话。历史直接搜索没有解析请求，这是原有行为。
3. 服务端只接受完整 36 字符 UUID v4，非法/过长值忽略。没有会话头也能工作；`requestId` 总是后端新生成，忽略外部 `x-request-id`。本版本不增加诊断响应头，也不修改响应体。
4. Vercel 项目 → **Logs / Runtime Logs**：先筛选 **Preview + 本次部署 + UTC 时间窗 + 两条 route**，打开请求详情中的 Log Messages。Build Logs 不能代替 Runtime Logs。
5. 在 message 搜索中粘贴应用 JSON 内的 `diagnosticSessionId` 或 `requestId`。Vercel 自身 Request Id 与这里的 UUID 不同。平台搜索/导出可能按“请求”聚合，不保证任意嵌套字段精确匹配或返回完整会话；必要时扩大窗口，导出后离线过滤。
6. 对照 JSON 的 `environment`、`commitSha`、`deploymentId`；未注入部署元数据时显示 `unknown`，本地为 `local`。同时保存部署详情 URL 作为版本证据，不比较不同提交/环境的混合记录。

### 事件与字段

| 事件/阶段 | 意义 |
| --- | --- |
| `http.request.started` / `http.request.completed`，`request` | 入口与返回；completed 包含真实 HTTP `status`、handler 总 `durationMs`，包括正常返回 4xx/5xx |
| `phase.completed` / `phase.failed` | 单个阶段经过的毫秒；失败也计时，不改变结果/错误传播 |
| `location.resolve.completed` | `outcome` = confirmed / needs_confirmation / not_found |
| `location.geocode` / `location.poi` | resolver 对应 provider 分支，含其嵌套上游耗时 |
| `location.normalize` | 地点候选业务归一化 |
| `search.category` / `search.category.completed` | 单类别完整调用；结果 empty / success / error，与 HTTP 状态区分 |
| `search.inter_category_wait` | 原有相邻类别固定等待；`scheduledMs=500`，`durationMs` 为实际等待，失败类别后仍等待，末项不等待 |
| `amap.fetch` | 发出原有 fetch 至响应头返回；**不是纯网络传输时间** |
| `amap.read` / `amap.json` | response.text() 与 JSON.parse() 独立阶段 |
| `amap.validate` | 高德响应/业务状态检查；HTTP 错误发生在已有的读取之后，仍保持原顺序 |
| `amap.transform` | POI 业务转换与原有距离排序；没有改变算法 |
| `search.completed` | success / partial success；HTTP 200 不代表每个类别均成功 |
| `diagnostics.error` | 一次规范化原因；`error.type`、数字 `error.code` 或 UNEXPECTED_ERROR、最内层失败 `stage`、durationMs（可计时时）、handled |

稳定公共字段：ISO timestamp、level（info/warn/error）、event、stage、requestId、route、环境/提交/部署维度；适用时包含 session、category、status、outcome。每次 console 输出都是一个 JSON 对象。**父阶段包含子阶段，不要把嵌套 duration 相加**；可比较同一请求内的互斥阶段（fetch/read/json/transform），剩余时间包括校验、对象构造、框架等。入口计时不包含平台启动、浏览器网络和响应传输的全部时间。

错误分类：network、timeout（只记录现有 fetch/运行时抛出的超时，不添加超时策略）、upstream_http、upstream_business、invalid_json、invalid_payload、internal。错误在现有 catch 边界记录并按同一请求/错误去重；handled=true 表示已映射响应、类别错误或原有恢复，不能解释为成功。未捕获异常先记录 handled=false 再原样抛出。正常返回 5xx 且尚无原因时记录一次通用错误。正常校验 4xx 有请求完成记录，捕获的校验/JSON 异常有规范化错误。

## 人工小样本采样

Preview 数据库与生产隔离，**高德 Key 共用**。确认配额后手动逐项执行，每次等待上一请求结束并留间隔；不使用并发/负载工具：

1. 相同地点解析 3 次；确认记录实际 geocode 或 POI 分支。
2. 单类别 bakery 3 次（无类别间等待）。
3. 三类别 3 次。
4. 八类别 3 次（7 段等待，计划合计 3500ms）。页面当前类别数可能不同，明确选取八项，不用“全选”推断数量。

配额不足时减量并注明实际样本数；本任务未自动执行上述真实采样。记录请求数量和上游调用数量，错误重试也会消耗额度。不要因为看到日志就改缓存、并发、间隔或请求参数。

| UTC 时间 | 部署 URL / commit | 场景/类别数 | session / request UUID | Chrome Duration / Waiting | 平台函数耗时 | server 总耗时 / 互斥阶段 | 上游调用数 | HTTP / 类别错误 | 冷启动/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 待人工采样 | | | | | | | | | |

Chrome Waiting/TTFB 含网络和服务器等待，不能当成纯 handler 时间。每个场景报告实际 n、中位数与范围、请求错误率和类别错误率；n=3 不作可靠 P95 结论。浏览器那次 1.67s 只作线索。

## 手动导出与离线 JSONL

1. 在上述 Logs 筛选后点击平台 Export（优先 **JSON**）；可选“屏幕所见”或“所有匹配搜索的请求”，优先后者。确认时间窗覆盖同次会话的两条请求。
2. 保存原始文件，例如 `preview-<short-sha>-<UTC-window>.json`。当前平台按请求组织导出；会话过滤不保证完整，应核对入口与完成事件、各请求 ID 和部署。超出限制分时间窗导出，并记录窗口，避免误把重复窗口当额外样本。
3. 用仓库自带 Node 离线脚本整理为 UTF-8 JSONL：

   ```powershell
   node scripts/diagnostics-export.mjs preview-export.json --output sample-all.jsonl
   node scripts/diagnostics-export.mjs preview-export.json --session <UUID> --output sample-session.jsonl
   node scripts/diagnostics-export.mjs preview-export.json --request <UUID> --output sample-request.jsonl
   ```

   支持 JSON 数组、嵌套请求对象中的 JSON message、JSONL；仅提取已知应用事件，忽略无关/损坏行，不联网，拒绝覆盖已有目标文件。CSV 不自动解析；请选择 JSON 或人工从 Log Messages 复制完整 JSON 对象为 JSONL。若平台格式变化/匹配为零，脚本非零退出，检查原始 message 结构，不能将空文件当成功采样。脚本只做提取，不保证平台导出了全量事件，也不替代对原始导出内容的隐私检查。
4. 检查每个 request 的 started/completed 是否成对，session 是否包含预期解析和搜索，错误原因及阶段是否齐全；缺失记录注明 truncated/missing，不补造时长。
5. 原始导出与 JSONL、浏览器观测表和部署 URL 一并存放在受控的本地位置，不提交仓库、不要传给外部日志服务。导出后文件由人工持久保存；应用不直接写文件。

平台限制（2026-10-23 核对官方资料，实际以当前套餐/UI 为准）：Hobby 保留 1 小时，Pro 1 天，Enterprise 3 天，Observability Plus 30 天（一次查询最多连续 14 天）。每请求最多 256 行、单行 256KB、合计 1MB。导出普通套餐最多 10,000 请求，Observability Plus 最多 100,000 请求。保留期届满无法靠本应用恢复；**手动导出不等于自动持久化**。

来源：[Vercel Runtime Logs](https://vercel.com/docs/logs/runtime)、[流式导出及数量限制](https://vercel.com/changelog/improved-streaming-runtime-logs-exports)。未验证本账户的实际套餐和 Export 权限，执行时核对。

## 复用、安全与故障排查

- 其他 API 可用 `withDiagnostics(route, handler)`，通过参数传递 diagnostics；使用 `measure/measureSync` 包裹原有操作，在现有 catch 调用 error。新 route、阶段、事件、类别、结果值须加入白名单，避免动态字符串进入日志。本次仅接入两条入口。
- `src/diagnostics.ts` 只有接口和注入辅助函数；server-only 实现在 `src/server/diagnostics/`。核心 CLI 调用不传 diagnostics 时不会引入 logger。不要从客户端导入 server-only 实现。
- 不输出原始异常 message/stack/cause、Key、URL/query、cookie、Authorization、坐标、原始查询词、完整响应或数据库连接串。只白名单构造字段；不要为排查临时 console.log 整个请求/错误。
- Vercel 原生元数据、浏览器 Network 和原始导出仍可能含 URL/请求信息；分享前另行审查、限制访问。日志 ID 只用于关联，不是认证，也不保证来自同一用户（UUID 格式校验不能证明身份）。
- 只有错误日志：核对开关是否精确 true、是否对正确 Preview 分支设置、是否重新部署。只有平台入口：展开 Log Messages；不要看 Build Logs。
- 没有同 session：确认请求头、UUID v4；旧缓存页面/直接 API 无会话头属正常。每个新解析/历史回放使用新 session；不要跨操作误拼。
- partial success：看每个 category outcome/error；不要只看 HTTP 200。上游失败后没有完整下游阶段是预期行为。
- 看不到日志：检查保留期、UTC 窗口、环境/部署过滤、平台行数限制、是否过早筛选排除了失败请求。
- 本任务不修复已有 PostgreSQL SSL 警告，不修改历史逻辑或全站 API，不更改生产变量/数据库。
