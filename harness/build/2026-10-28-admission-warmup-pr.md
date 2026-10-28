# 高德准入数据库连接预热：独立 PR 交付

## 问题与行为

低频访问时，数据库建立冷连接会占用原短准入时间。此改动在原准入之前，通过同一准入专用 Prisma Client 执行 SELECT 1，并用每实例单任务协调器合并等待。普通历史连接池保持现状。

本地准入池 min=1、idleTimeoutMillis=60000；Vercel min=0、idleTimeoutMillis=5000，并接入 @vercel/functions@3.6.1 的 attachDatabasePool。两者 max=4、connectionTimeoutMillis=8000、query_timeout=1200。准备截止10秒，新鲜度10秒、失败冷却1秒，无周期保活或内部重试。取消的等待者不会取消其他等待者，迟到操作结束前保留协调槽。

Next Node 启动通过 instrumentation.register 等待准备；构建、Edge和缺失配置时跳过。请求入口在池移除/错误、状态过期或墙钟回退后重新准备。失败映射至既有ADMISSION_UNAVAILABLE。普通Web端到端截止与取消继续生效。

三个连接启动参数 statement_timeout、lock_timeout、idle_in_transaction_session_timeout 暂不传入；事务内原set_config、800ms事务预算、600ms获取上限和额度/QPS逻辑保留。新增admission.failed固定字段日志用于预约/放行失败诊断，不输出消息、堆栈、SQL、参数、凭据或资源标识。

## 已有真实证据与未解决问题

2026-10-28本地只读验证：首次预热2092.23ms；12个就绪等待者0.06ms；空闲11秒重查375.43ms，仍保持同一物理连接。该证据来自本地单次测量；Vercel真实暂停/恢复尚待Preview验收。

随后独立准入复现中预热2349.22ms成功，但reserve在clock.select步骤出现P2028，事务调用1522.96ms、最近阶段300.97ms、budgetMs=800、maxWaitMs=600。预约写入及grant尚未执行，高德调用0。P2028子原因仍未确认，本PR未调整事务预算或压缩SQL往返，因此不宣称已解决完整准入事务失败。

旧启动参数组合失败、简化后成功的对照已观察到，具体哪个启动参数触发问题尚未逐项隔离。

## 提交与验证范围

本PR直接基于master，包含预热/池生命周期、相关失败诊断、安全出口门禁、依赖与隔离测试。联合查询CLI、报告、预算绕过及其他任务的本地修改均不进入本PR。原联合查询探索按用户决定停止，真实证据已归档Issue #27。

验证采用与提交树一致的独立导出目录，复用本地依赖及生成客户端，不复制环境变量文件，不创建Git Worktree。本次交付不连接真实数据库、不调用高德、不修改Schema/绑定/额度、不部署或合并。

最终测试、类型及构建结果将在PR正文记录；历史本地结果与本次提交树验证分别报告。

## 本次提交树验证结果

在独立导出目录验证通过：npm test为209项核心/Route＋19项AST，共228项、失败0；npm run check通过；npm run build通过，8个静态页面生成；暂存差异检查通过。最初构建因未复制环境文件而缺少DATABASE_URL，按现有CI提供占位DATABASE_URL/DIRECT_URL后构建通过，没有连接真实数据库。复用本地已安装依赖，GitHub CI的新安装结果另行报告。
