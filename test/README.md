# 测试说明

## 准入连接准备与诊断

默认npm test新增database-readiness、database-startup、database-runtime、admission-diagnostics四份隔离测试，覆盖单任务合并、取消隔离、超时/冷却/失效、本地与Vercel池策略、启动跳过与等待、普通池配置不变、事务内限时及安全诊断字段。数据库依赖与启动文件同时受AST门禁约束。测试使用假池/假Prisma，真实Vercel暂停恢复和真实P2028消除尚待验收。
