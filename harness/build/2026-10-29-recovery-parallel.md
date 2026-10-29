# 数据库异常恢复与最多两类并行（2026-10-29，本地交付）

## 交付状态与版本

实现数据库暂时性故障逐类恢复、事务有界收尾及最多两个类别任务。真实高德调用 0 次；原生产采样账本保持关闭。交付范围为本地实现与验证，PR、正式发布及真实端到端验收另行安排，线上问题保持待验收。

- 工作区 HEAD：`7a629deff54f08f3f7e4782d4bdf3b6ea4938a1c`，补丁尚未提交；HEAD 作为起点，实际验证版本使用下述源码指纹。
- 本轮最终源码及测试指纹：`0e533660109e9d6a01fe7723f4a06687dde8ec7c9ce69b512d9ecd385387bf1c`。算法：对本轮变更的 TS／TSX 文件按路径排序，序列化路径和 SHA256 映射，再取 SHA256。逐文件记录见 `.local/poi-union-v1/recovery-parallel/manifest.json`。
- 验证环境：Windows、Node.js v24.19.0、独立 loopback PostgreSQL 18.4 临时数据库。所有高德响应均为模拟；临时库按测试独立新建并清理。
- 进入本轮时保存了 249 个既有文件的哈希；本轮相关文件以外内容、原 Git index 和关闭的真实调用预算账本均核验保留。原分支与暂存内容保留。

## 修改内容

### 事务收尾与连接恢复

`src/admission/database.ts` 纳入预约窗口修复，将 reserve 和 grant 的已发送批次读取上限统一为 3000ms。业务准入 2s、票据期限限制调用者等待与发送资格；已发送的四条语句继续独立有界排空。事务内 `statement_timeout` 上限 800ms，`lock_timeout` 上限 150ms，`idle_in_transaction_session_timeout` 固定 5000ms。保留四条 SQL 在等待结果前全部发送和原子事务。

COMMIT／ROLLBACK 排空后核验 pg `getTransactionStatus() === 'I'`，健康连接归还。断连、协议状态异常、同步发送不完整或超过 3s 导致确认未知时，连接以 `release(true)` 从池移除；pg 流水读取超时负责关闭实际 socket。优先保留原始 SQL／驱动错误，避免非空闲状态检查覆盖读取超时分类。

`src/admission/errors.ts`、`service.ts` 固定表达 `next-category`／`stop` 恢复性质和 `healthy`／`replace`／`unknown` 连接处理状态。借连接、驱动读取、临时网络／数据库连接错误，以及 SQL 取消、锁等待、死锁、序列化冲突及事务空闲会话终止允许后续类别重新准入。明确缺函数、权限、绑定／配置错误停止新增任务。当前类别保留单次尝试，提交不明保留保守扣额，后续类别领取自己的预约和许可。

`src/db/readiness.ts` 等待剩余冷却后共享一次探测，单个取消只结束自己的等待。池移除单个损坏连接时，其他健康连接的准备状态保留；池空或状态不明时重新准备。

### 等待与并行

reserve 和 grant WAIT 返回的等待时间扣除 `max(0, floor(functionToCommitMs) - 1)`，最低为零；缺少观测时保留原等待。票据截止、许可 TTL、资源锁内时隙与额度校验保持生效。

`src/search/service.ts` 默认最多两个类别任务，内部支持 `concurrency: 1` 对照。同一次搜索的准备和准入通过可取消队列执行，取得许可后立即发送对应 HTTP；一个 HTTP 等待期间可以为另一个类别准入。首次对照曾暴露两个并行准入在单连接池下争用并造成票据过期，因此采用准入排队与 HTTP 重叠。无额外固定类别间隔。

按原类别索引保存执行中和完成结果，乱序完成保持返回顺序与原类别去重优先级。全局停止令牌在准入队列释放之前生效，撤销未发送等待；已发出的 HTTP 可结算。用户取消及总截止中断所有任务。截止快照保留所有已完成索引，执行中记到期，排队项记 skipped。

只有实际停止剩余工作时才提供 `termination`；最后一类失败且其余工作已完成时保留类别错误。全部暂时性类别失败返回 HTTP 200、`partial success` 和完整类别列表。`SearchApp.tsx` 展示零类完成及逐类原因，替换原 502 汇总行为。明确全局额度／认证／配置故障沿用停止和公开错误协议。

### 安全日志

失败准入仅输出一次 `admission.failed` 汇总，成功保持静默。包含 attemptId、operation、预约耗时、业务剩余、独立读取上限、四语句计时与固定错误标签、提交确认、恢复性质和连接处理。准备、入口上限及编排失败也提供安全汇总。日志排除连接串、SQL 参数、原异常文字和数据库内容；诊断或日志输出失败保持业务结果。

## 验证

| 检查 | 最终结果 |
| --- | --- |
| `npm test` 核心／Route／实验 | 283 通过，0 失败 |
| `npm test` AST | 19 通过，0 失败 |
| 独立临时 PostgreSQL 集成 | 35 通过，0 失败；包含 10 组延迟矩阵及 6 种同轮恢复注入 |
| `npm run check` | 核心与 Web 类型检查通过 |
| `npm run build` | 核心及 Next.js 生产构建通过 |
| 本地浏览器真实 SearchApp＋模拟 API | 零类完成提示、完整失败列表、逐类原因及无未处理拒绝检查通过 |

新增与调整测试位于 `admission-diagnostics`、`admission-postgres`、`database-readiness`、`database-runtime`、`search-service`、`request-lifecycle` 和 `request-safety-route`。保留跨进程速率、最后额度竞争、取消、SQL／锁超时、防重与过期许可零发送的已有回归。

COMMIT 应答延迟矩阵对 reserve／grant 分别注入 100／400／1200／2500／3300ms：

- 100–2500ms 可排空并确认 COMMIT，健康连接复用；2500ms 场景调用者约 2s 及时结束，后台继续完成确认。
- 3300ms 超出读取硬上限，记录 `driver_read_timeout`、`unconfirmed` 及连接替换；后续新预约恢复成功。grant 已提交时额度保留，过期许可无 HTTP 发送。
- 预约确认滞留约 696ms，复现约 104ms 票据余量；迟到的 grant COMMIT 排空后归为类别等待到期，后续类别成功。
- 同一轮搜索分别注入 `57014`、`55P03`、`40P01`、`40001`、实际后端断连和实际 pg 驱动读取超时：首类失败，其后两类成功。SQL 回滚复用原 backend；断连／读取超时更换 backend。5s 事务空闲终止只影响对应会话。

一次隔离检查曾因 malformed JSON 回归使用 5ms 总期限，受到运行调度影响返回 504；将该测试期限调整为 50ms，保留挂起正文的截止验证，最终完整检查通过。产品运行参数保持原值。

一次后续完整重跑中，已有的 POI 联合查询 CLI dry／mock 子进程检查偶发以安全错误退出；该项单独回归通过，随后最终完整重跑 283＋19 项全部通过。未修改 POI 模块，该次环境／存储异常的具体来源未复现，记录为既有测试稳定性观察。

## 性能对照与证据入口

测试为同十类别、第一页、25 条、串行／最多两任务各三轮。真实临时数据库经 TCP 代理请求、响应各增加 150ms，模拟 HTTP 延迟 2s；另做 5ms 快响应对照。资源间隔 800ms、wait 2000ms、grace 800ms、许可 TTL 400ms，准入池最多 1 条物理连接以验证争用下的排队。

最终逐轮数值与中位数见 `.local/poi-union-v1/recovery-parallel/benchmark.json`、`benchmark-summary.json`；所有类别均成功，最多两个 HTTP 同时执行，快响应时峰值一个 HTTP。各轮记录保存原类别顺序、状态和错误码。

| 轮次 | 串行（ms） | 最多两任务（ms） | 模拟类别成功数 |
| --- | ---: | ---: | --- |
| 2s HTTP，第 1 轮 | 26400.22 | 14300.63 | 两者各 10/10 |
| 2s HTTP，第 2 轮 | 26361.39 | 14328.80 | 两者各 10/10 |
| 2s HTTP，第 3 轮 | 26345.90 | 14293.12 | 两者各 10/10 |
| 5ms HTTP | 10735.91 | 10758.75 | 两者各 10/10 |

2s HTTP 的中位数由 26361.39ms 降至 14300.63ms，降低 **45.75%**，达到至少 20% 的目标。快响应对照中两种模式均无失败；吞吐继续受数据库资源速率控制。

本地证据目录 `.local/poi-union-v1/recovery-parallel/`：`test.log`、`check.log`、`build.log`、`postgres.log`、`postgres-result.json`、`benchmark.log`、`benchmark.json`、`benchmark-summary.json`、`benchmark-cleanup.json`、`browser.json`、`manifest.json`。`postgres.mjs` 与 `benchmark.mjs` 仅接受本次 loopback 试验集群并拥有新建临时库，便于本机复查。

下一步为独立 PR 与部署交付，再按另行确定的真实调用预算验证正式数据库、Vercel 生命周期及真实高德整条链路。此前生产 COMMIT 应答迟到的底层网络／代理来源仍待线上证据；本补丁已覆盖其业务恢复与连接处置路径。


## PR 提交快照与 Preview 交付（2026-10-29）

本轮以最新 master `c5a98698e6c4f8b0ec8d4a054fe1ac12334369f4` 为基线，分支 `Nearby-数据库异常恢复与两类并行`，仅收录 19 个实现／测试文件和 5 个相关文档。共享文档从 master 增补本次内容，保留原工作区与暂存区。前述 283 项为包含本地实验的工作区结果；准确 PR 快照使用 master 的测试清单，243 项核心／Route、19 项 AST、35 项真实临时 PostgreSQL 集成全部通过，类型检查与生产构建通过。未修改依赖、迁移或线上环境配置；本轮真实高德调用 0 次。

当前授权为提交、推送、创建面向 master 的 PR 和验证 Preview。Preview 的真实搜索测试由用户执行，正式发布等待用户随后批准；本 PR 保持开放。具体 SHA、CI 和 Preview 部署状态以 PR 页面及本地 recovery-parallel-pr 交付状态记录为准。
