# 测试与验证

默认 npm test 使用受控替身，包含 AST 高德出口门禁、核心/Route 测试及数据库连接准备、流水批次、诊断和取消测试。npm run check、npm run build 分别验证类型和生产构建。

独立数据库集成命令：

```powershell
$env:NEARBY_ADMISSION_TEST_DATABASE_URL = "postgresql://test_user@127.0.0.1:55440/nearby_admission_test_local"
npm run test:admission:postgres
```

该命令只接受 127.0.0.1 且数据库名前缀 nearby_admission_test 的可丢弃数据库，重建准入表、函数、触发器及审计夹具。数据库入口使用 NEARBY_ADMISSION_TEST_DATABASE_URL，高德使用模拟响应。CI 采用 PostgreSQL 17 临时服务独立运行此步骤。

覆盖预约容量、原子扣额、防重、上海日/月周期、资源/绑定/策略变更及竞争、跨进程速率、取消、提交确认丢失、SQL/驱动超时、后端断连、迟到连接、部分结果和真实 Route。十类别测试每批响应增加 300ms；TCP 代理另为请求/响应各加 150ms，验证完整准入两批次。最终响应延迟超过许可 400ms 时发送停止。结果见 [交付记录](../harness/build/2026-10-28-admission-functions.md)。
