# 准入事务诊断补充

日期：2026-10-29，Asia/Shanghai。交付为当前工作区的本地补丁，入场分支 `Nearby-多类别真实数据探索-V1`，HEAD `7a629de`；既有实验及其他改动保留。

## 生产故障证据

本轮通过 Vercel 只读 API／CLI 核对正式部署 `dpl_Fa2rWkLot9JZJw95aDE6wbrPejmf`，对应 master `5b0456e288356a3ccbe8ec0fdd1ab81b273f5bff`，状态 READY、target production。PR #29／#30 已合并，早前本地文档的未提交描述保留为历史语境。

用户返回数据为深圳北站十类别搜索：bakery 成功 25 条，billiards 失败 ADMISSION_UNAVAILABLE，其他八类 skipped。2026-10-29 13:01:02.392 的日志对应请求 `9qhtt-1793250053727-b8d66e40c9f5`，phase reserve、step commit、acquireMs 0.13、batchMs 1201.05、remainingMs 798、budgetMs 800、maxWaitMs 600、committed false、sqlState null。12:56:40.748 的请求具有相同失败模式。现有日志与 1200ms 驱动读取上限吻合，提交延迟的来源继续调查。

调查期间另以本地 Windows 客户端连接 Preview 数据库，运行六个只读事务批次：混合协议三次约 275–287ms，统一扩展协议三次约 287–294ms，全部成功。此证据用于比较发送方式；生产事务的提交时序以正式环境日志为依据。

## 新增诊断

每个失败阶段继续仅输出一条 `admission.failed`；成功路径保持静默。沿用原有日志字段和业务行为，新增：

| 字段 | 含义 |
| --- | --- |
| attemptId／operation | 每次 createAdmission 调用生成 UUID，预约及至多两次放行共享；操作为内部枚举。直接调用 store 且未传 trace 时 attemptId 为 null |
| readTimeoutMs | 派发时实际使用的驱动读取上限，按剩余时间缩短；尚未派发为 0 |
| statements | 固定顺序 begin、configure、function、commit；submittedMs／settledMs 使用单调时钟，相对批次开始记录，缺少观测为 null |
| statements.status | not_submitted、pending、fulfilled、rejected；同步 query 调用失败记录在对应语句 |
| statements.command | 仅允许 BEGIN、SELECT、COMMIT、ROLLBACK，其余值使用 null |
| statements.sqlState／errorKind | 每条失败语句的 SQLSTATE 及固定错误类型，成功时为 null |
| functionToCommitMs | 函数查询成功返回后，至 COMMIT 查询结算的客户端观测间隔；缺少对应结果时为 null。它包含网络、驱动及调度等待，含义区别于数据库内部 COMMIT 执行时长 |
| commitAck | confirmed_commit、confirmed_rollback、unconfirmed、not_submitted；只有明确收到 COMMIT 命令才标记 committed true |
| connectionDestroyed | 执行器已借用连接且最终选择 release(true)；用于记录销毁请求，底层物理关闭由驱动执行 |
| errorKind | driver_read_timeout、database、connection、cancelled、deadline、admission_refused、unknown；识别固定驱动特征／错误码，原始错误文本留在内存 |

step 新增 begin，acquire 专指借连接。诊断按客户端结果到达时间记录，四条命令仍在首次等待前全部入队；提交确认、SQL 限时、连接回收、取消排空及最终许可策略沿用原实现。记录回调和日志输出均隔离异常。日志包含固定标签、计时和随机关联标识，凭据、SQL 参数、查询正文和原始函数返回值均留在内部。

## 验证及状态

本轮先通过新增用例重现 BEGIN 标签错误和 COMMIT 读取超时缺少诊断字段，再完成实现。最终对应当前补丁：

- `npm test`：270／270 核心、Route 与实验测试，19／19 AST 检查通过；诊断测试 17 项。
- `npm run check`、`npm run build`：通过。
- 独立 loopback PostgreSQL 18 集成：31／31 通过，包含真实驱动读取超时、断连、提交确认丢失、取消、跨进程速率与额度竞争。
- 新增受控回归覆盖前三条完成而 COMMIT 超时、每条语句 SQLSTATE、函数至提交返回间隔、同步派发失败、ROLLBACK、断连但收到 COMMIT、取消后继续排空、诊断回调与日志异常、trace 关联和敏感字段排除。
- 本轮新建 `nearby_admission_test_diagnostics_20261029_1793251333281`，限定 127.0.0.1:55440，测试结束已删除。高德全部使用模拟响应，真实调用 0 次。

修改前相关文件副本与本轮命令输出位于受忽略的 `.local/admission-diagnostics-20261029-131824/`，包括 test.log、check.log、build.log、postgres.log。补丁尚未提交、推送或部署，新增生产字段的实际输出留待应用交付后核验。

## 独立发布快照验证（2026-10-29）

基于 master 5b0456e288356a3ccbe8ec0fdd1ab81b273f5bff，独立分支 Nearby-准入事务诊断；本次仅包含两个准入模块、诊断测试和五份相关文档，共 8 个文件。准确源码快照验证：230 项核心／Route + 19 项 AST，31 项独立 loopback PostgreSQL 集成，check/build 全部通过。测试临时库已删除，原工作区入场文件哈希及暂存区哈希保持一致。

当前授权继续覆盖 PR、Preview、正式发布和最多 32 次有界真实采样；本段记录提交前状态，后续版本、部署及采样结论单独追加。
