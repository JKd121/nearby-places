# 测试与验证

## 当前执行入口（2026-11-03 整理）

使用 Node.js 24 和 npm ci。在仓库根目录运行 npm test、npm run check、npm run build。npm test 的具体文件以 package.json 显式列表为准，新增测试同步该列表；部署检查与 AST 的 .mjs 用例在末尾单独运行。测试使用受控替身，真实高德调用为 0。

构建需要有效格式的数据库环境；独立终端可设置 DATABASE_URL、DIRECT_URL 为 postgresql://ci:ci@localhost:5432/nearby_ci，仅供隔离检查。Prisma 客户端生成使用 npx prisma generate --config prisma7.config.ts。命令会写入 dist、.next 和类型缓存。

npm run test:admission:postgres 仅连接 NEARBY_ADMISSION_TEST_DATABASE_URL 指定的 loopback 可丢弃库，数据库名必须以 nearby_admission_test 开头；会重建测试表／函数，高德使用模拟响应。CI 启动 PostgreSQL 17 临时服务。

CI 对全部目标分支的 PR 和 master push 运行上述四类检查。生产 job 只在 master push 验证成功后运行；同分支 PR 的重复验证可取消，生产发布串行并核验最新主线 SHA。发布配置及结果见 [维护指南](../CONTRIBUTING.md#发布与回退)。

新增 deployment.test.mjs 使用内存 fetch 替身，覆盖无效输入、异常状态、部署提交不符、元数据匹配及凭据仅发送到 Vercel API，真实网络调用为 0。

当前生产业务默认最多两个类别任务、同次准入排队、HTTP 可重叠。全部类别失败保留完整列表和逐类原因；已发送批次独立排空 3s，事务空闲保护 5s。以下按日期记录保留此前版本的覆盖背景，当前行为以此段及主线源码为准。

浏览器夹具采用 mock API／内存历史，独立于 CI。真实高德、生产数据库和真实 Vercel 断连分别验收。本轮维护验证见 [交付记录](../harness/build/2026-11-03-github-maintenance.md)。

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
