# 项目状态与待办

## 业务发布基线（2026-11-03 核对）

- 业务基线：`1d778f9342cc84c3a84f9dd59052e35f5c5fe965`，PR #32 已于 2026-10-29 合并；包含数据库异常恢复、连接收尾与最多两类并行搜索。
- 对应该提交的 PR CI／master CI 成功，Vercel Production 状态成功；PR #32 记录首页 200 和无效搜索 400。此处为既有发布证据，本轮另行记录新的核验。
- 上次准确提交验证：243 项核心／Route、19 项 AST、35 项临时 PostgreSQL 集成，以及 check/build。性能 45.75% 改善来自 300ms 数据库 RTT＋2s 模拟 HTTP 的三轮本地对照。
- 最新版本的完整真实高德生产验收和 Vercel 断连验收仍待完成，跟进 [Issue #24](https://github.com/JKd121/nearby-places/issues/24)。

## 维护交付

- [PR #33](https://github.com/JKd121/nearby-places/pull/33)：维护指南、Issue／PR 模板、文档同步、历史整理和 CI 成功后的生产发布。
- Vercel 项目身份及 GitHub Production 三个 secrets 名称已核对，生产任务的实际运行结果随本轮交付记录更新。
- 公开前审查已覆盖 Git 历史、讨论、Actions 和图片；仓库已公开，master 强制 PR／CI／最新基线／讨论解决及管理员约束已启用。
- PR CI 已通过四类检查；Preview READY，经认证核验首页 200、无效搜索 400。失败门禁夹具 #34 已验证 CI 失败时主线合并受阻、生产任务跳过，并已关闭清理。
- 最新维护合并、生产结果及发布索引见 [PR #33](https://github.com/JKd121/nearby-places/pull/33) 和 [Releases](https://github.com/JKd121/nearby-places/releases)。
- 本轮交付与历史整理清单：[维护记录](harness/build/2026-11-03-github-maintenance.md)。

## 产品及工程待办

- [#6](https://github.com/JKd121/nearby-places/issues/6)：补充地点信息入口及地址解析后的用户确认交互尚有缺项，保留开放。
- [#14](https://github.com/JKd121/nearby-places/issues/14)：请求级诊断、会话关联和导出仍有独立价值；已有准入失败诊断见 PR #31。
- [#17](https://github.com/JKd121/nearby-places/issues/17)：额度／共享速率已落地，公平性、滥用治理和协议研究继续跟进。
- [#24](https://github.com/JKd121/nearby-places/issues/24)：补齐真实生产验收和仍有效的根因调查。
- 旧方案、草稿及实验逐项处置见本轮维护记录；当前代码入口见 README，维护约定见 CONTRIBUTING。

## 历史记录

整理前 PLANS 原文完整保存于 [2026-11-03 归档](harness/build/2026-11-03-plans-history.md)。按日期的决策、参数和测试结果继续保存在 [build-log](harness/build-log.md) 及 [build](harness/build/)；当前摘要随对应发布更新。
