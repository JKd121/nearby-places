# Nearby 高德 POI 2.0 联合查询隔离实验 V1

独立 TypeScript CLI，只开发实验能力。生产调度器、单类别解析、前端上限、API 协议及 PostgreSQL 额度/QPS 策略均不改。当前交付仅允许 Dry/Mock；真实采集须另获用户授权，不能把示例命令当成授权。

## 使用

在仓库根目录使用 Node.js 24 和现有依赖：

```powershell
npm run experiment:poi-union
npm run experiment:poi-union -- --mode mock
```

默认 `dry` 只生成 9 项请求计划，真实 HTTP=0、模拟传输=0，不加载数据库或 Live 模块。`mock` 使用合成 POI 经现有统一传输层完成 9 项处理，真实 HTTP=0、模拟传输=9；模拟准入不连接数据库。无需 Key 或数据库配置。源码入口 `cli.ts`，命令先编译，再运行 `dist/scripts/experiments/poi-union/cli.js`；不要通过 tsx 或复制入口启动。

每次输出到当前 checkout 的 `.local/poi-union-v1/reports/<mode>-<time>-<uuid>/report.json` 和 `report.md`。路径按入口位置固定，不随启动 cwd 变化；没有自选输出目录、预算、重试、页码、并发或 reset 参数。不会默认加载 `.env` 文件，也不会打印配置路径或原始异常。

## 本地选址

复制 `config.example.json` 到被 Git 忽略的 `.local/poi-union-v1/config.json`，只在本地将三个 null 坐标换成已确认的 GCJ-02 高德坐标。选择低/中/高密度三个不同地点，density 为人工选址假设，程序不调用地理编码或额外 API 验证密度。半径统一，范围 1–50000 m，默认示例为 1000 m。坐标范围、三个位置互异及三种密度标签均有校验；占位示例不能用于 Live。

可在无网络模式提前验证自己的私有配置：

```powershell
npm run experiment:poi-union -- --mode dry --config .local/poi-union-v1/config.json
npm run experiment:poi-union -- --mode mock --config .local/poi-union-v1/config.json
```

未提供配置时 Dry/Mock 使用合成点；Live 必须提供完整本地配置。不要将真实坐标放入示例、提交记录或报告；只提交经过检查的聚合报告。`.local/poi-union-v1/` 整体被忽略。

## 计划与分类规则

- A（3 类）：酒店、商场、火锅，覆盖住宿/购物/餐饮。
- B（5 类）：A + 健身房、公交站，增加娱乐/交通。
- C（10 类）：当前 `CATEGORIES` 全部类别。

每地点依次 A/B/C，每组 3 次，共 9 项；3/5 类组合嵌套于 10 类。编码始终读取 `src/amap/categories.ts`，不维护第二套编码表。配置类别数量发生变化则拒绝原计划。固定 `/v5/place/around`、`page_size=25`、`page_num=1`、`sortrule=distance`、`show_fields=business` 及同一半径。`types` 使用 `|` 拼接，无关键词。纯串行；PostgreSQL 既有准入决定实际等待，不额外修改速率设置。

统计独立读取响应 `pois[].typecode`，不用生产 `searchNearby()` 给整批 POI 赋单一类别。所有配置类别都计数（包括意外返回的未请求类别）；匹配优先使用 `acceptedTypecodes`，否则使用 `types`，仅精确匹配且唯一时归类。没有完整父子编码表，因此如 `150700` 查询出现配置未列出的编码，保留原始六位编码聚合并列为未确认，不按前缀推断归属。多个类别同时明确匹配也列为未确认。

只保留六位数字编码的聚合；缺失/任意异常文本分别进入 `<missing>`/`<invalid>` 固定桶。POI 名称、ID、坐标、business、原始响应和任意上游文本均不保存。空 `pois: []` 是成功空页；缺少/非数组/超过 25 项的 pois 为安全 payload 错误并停止；数组内无效项计入页数量及未确认桶，另记 invalidItems。

## 安全链路核查

本轮已阅读用户指定的十个源文件，现有生产调用为：

`app/api/search/route.ts` → `executeResolvedSearch()` → `createServerAmapClient()` → `createAmapTransport({ beforeAttempt: getServerAdmission(...) })` → `searchNearby()`。

实验 Live 使用：

`cli.ts` 配置/授权/全局预算检查 → `live.ts` 取得 `getServerAdmission()` hook → `runner.ts` 装配 `createAmapTransport({ beforeAttempt })` → `transport.requestJson()` 调用 hook → `createAdmission()` → `PostgresAdmissionStore.reserve()` → 事务外等待 → `grant()` 联合校验预算/速率 → `AttemptPermit` → 传输层 `permit.assertValid()` → HTTP → JSON 校验 → 隔离分类统计 → 安全报告。

复用 `src/server/admission.ts` 的真实 hook、懒加载 PostgreSQL store 和 `getRequestPolicy()`。不导入生产客户端执行单类别转换，不改任何生产源码。只有统一传输层调用注入的 HTTP 计数包装器；包装器在许可校验之后检查上限、同步写尝试日志，再调用原生 fetch。没有额外 HTTP 出口。实验还要求 hook 返回有效 permit；缺失即拒绝。准入失败、许可过期、请求取消、超时及任何请求/解析错误均停止剩余项目，即使现有错误分类将某错误标为可恢复；报告保留原有 `classifyError()` 动作和 `safeErrorDiagnostic()` 错误码，不另造生产错误协议。

不配置或迁移数据库，不修改 Key、绑定、额度、QPS 或准入间隔。现有绑定缺失、资源停用、预算不足及数据库异常都会拒绝。事务提交不确定时不重试、不退款。实验未验证真实 PostgreSQL 环境或高德账号是否就绪。

## Live 前人工确认（本次不执行）

需要另获真实采集授权，并由操作者确认：

1. 同意这一轮最多 9 次高德调用及正常 PostgreSQL 准入计数；三个私有点、半径、类别和字段配置正确。
2. 当前进程已安全提供既有 `AMAP_WEB_SERVICE_KEY`、`DATABASE_URL`，以及正确的 `AMAP_CREDENTIAL_ID`（未设置时沿用生产 `primary`）；Key 与 credential/binding 的真实资源对应已核实，不为实验换 Key 或修改政策。
3. 目标数据库已具备现有准入 schema、启用的 nearby 资源绑定和足够正常额度；不能满足则停止，不能为了运行实验调整额度/QPS。
4. `getRequestPolicy()` 所需环境覆盖完整且有效；保留现有默认或已批准设置。人工检查报告目录可写；只从当前 checkout 的编译入口启动。
5. `.local/poi-union-v1/live-budget.lock` 不存在。已有锁表示本轮预算已预留；不能删除、换目录、换 checkout 或重复采集来补跑。停止/失败也不自动恢复剩余额度。

只有上述条件与单独授权成立后，操作者才可执行以下入口；这里展示语法，不代表已经授权：

```powershell
npm run experiment:poi-union -- --mode live --config .local/poi-union-v1/config.json --authorize-live-9
```

如果环境只保存在本地文件，应由操作者在授权后通过 Node 的 `--env-file` 显式加载到编译入口，或安全注入进程；程序不会读取/打印现有环境文件。`server-only` 需要 `--conditions=react-server`，npm 命令已包含。

Live 启动前以 `wx` 排他创建固定预算锁并预留全部 9 次；另一个进程/参数组合无法再次取得本轮预算。每次 HTTP 前同步写入并 fsync 追加尝试日志，进程内计数再次限制 9 次。锁和日志不会自动删除，没有补跑、续跑或 reset 接口。该保护适用于本 checkout 的未修改程序；不同仓库副本或人工删除锁不提供分布式全局约束，属于禁止的人工绕过。

## 报告、失败与解释边界

JSON 每项记录匿名站点、组别、请求类别/编码、准入结果、真实/模拟调用数、HTTP 状态、归一化业务状态、安全 infocode/errorCode、原有错误动作、总/准入/响应耗时、原始页条数、各类别计数、原始编码分布、未确认数量和分布，以及是否达到 25 条。业务失败状态使用 `non-success`，因为现有传输层只公开安全错误码，不暴露任意原始业务状态文本；未获得可确认业务状态时为 `unavailable`，不推断为 0。

初始计划、每条完成/失败记录及最终状态都会检查点保存，两种格式分别临时写入后原子替换。存储失败停止后续请求；正常 SIGINT/SIGTERM 使用现有 RequestContext 取消并保存已完成结果。磁盘不可写、断电、SIGKILL 或两个报告文件替换之间的崩溃无法保证最后一条/两文件同时落盘；之前已保存报告与预留预算仍保留，不能补跑。

Markdown 包括逐项比较、10 类计数矩阵、typecode 聚合及各组成功样本的平均耗时/已确认覆盖率。耗时均为本进程观测：总耗时包含准入，响应耗时从 HTTP 调用至读完/校验完；Mock 的这些值只是本机模拟耗时。覆盖率为明确匹配到 POI 的请求类别占比，未知编码可能低估；0 条不能说明附近没有该类别。第一页 25 条仅提示潜在分页竞争，没有独立类别对照，不能声称测得独立查询 POI 保留率。最多 9 个样本、每组最多 3 个，还受固定执行顺序及地点/时间变化影响，不能推断普遍最优类别上限。

公开样例见 `harness/build/poi-union-v1-samples/`，均为 Dry/Mock。测试清单及实测结果见 `test/README.md`、`harness/build/2026-10-28-poi-union-v1.md`。验证完成即停止；没有真实数据、CI、Preview、生产部署或真实断连验收结论。
