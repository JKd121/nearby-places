# POI 联合查询实验 V1 测试

`poi-union.test.ts` 纳入默认 `npm test`，覆盖隔离联合查询 CLI 的默认无网络、3/5/10 类组合、精确编码/父子编码未确认、异常/空数据、真实准入 service 搭配假 store 的调用顺序、拒绝/许可失效/取消/超时停止、最多 9 次、跨进程预算锁、失败检查点及报告脱敏。CLI 子进程测试禁止原生 fetch；Live 缺失配置检查清空进程 Key/数据库变量；全部不调用真实高德或数据库。使用及证据见 [实验说明](../scripts/experiments/poi-union/README.md)；这不代替真实 PostgreSQL 或 Live 验收。
