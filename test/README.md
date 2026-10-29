# 测试与验证

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
