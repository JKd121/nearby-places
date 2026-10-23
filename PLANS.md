# Project Harness

- Current State: VERIFY — Nearby Diagnostics v1 Stage A，本地 116/116 + check/build + 实际 Chrome mock 链路通过，仅观测。
- Active Approved Phase: Issue #14 Stage A；用户 2026-10-23 明确要求开发、验证、独立分支提交、Draft PR 和 Vercel Preview，完成后暂停。
- Current Plan / Evidence: `harness/build/2026-10-23-diagnostics-stage-a.md`
- Baseline: latest fetched origin/master `3bc08d4f7636b72c7206f1d9e4cb6272c212e41b`; worktree b368; branch `perf/search-observability`。
- Next Action: 提交 Draft PR，确认 Preview；真实日志采样由人工执行。禁止 Stage B、生产配置/数据库变更、搜索行为或 UI 变更。
- Reconciliation: 旧记录中的历史发布已在 master 的 PR #3 合并；本轮不继续或重复旧任务。

- Project: 地点周边生活服务聚合器
- Repository: `C:\Users\lenovo\Documents\ChatGPT\地点聚合器`
- Released Baseline: v0.1C COMPLETE
- Prior State (historical): 2026-10-05 历史直接搜索本地实现及人工验收通过，103/103、check/build/schema及实际浏览器通过。用户已授权上线；生产confirmedLocation迁移成功，14条旧记录数量/摘要未变。应用发布及真实链路验证进行中。此前偶发历史更新失败根因仍未确认。
- Prior Approved Phase (historical): History Confirmed Location — 生产迁移、发布与验证
- Prior Approval Source (historical): 本聊天用户在完整方案展示后明确“我确认授权”，人工核验后回复“通過”，继而明确要求“进行上线部署”；当前授权覆盖已验收范围的必要数据库迁移、Git提交/推送、正式部署和生产核验。
- Prior Workflow State (historical): IMPLEMENT — HISTORY_CONFIRMED_LOCATION_RELEASE（用户已人工核验通过并授权“进行上线部署”；迁移、发布及真实链路验证进行中）
- Prior Plan (historical): `harness/build/2026-10-05-history-confirmed-location-release.md`（用户授权上线）；实施计划：`harness/build/2026-10-05-history-confirmed-location-plan.md`；上轮已完成计划：`harness/build/2026-10-04-history-experience-plan.md`
- Prior Evidence (historical): `harness/build/2026-10-05-history-confirmed-location-verification.md`；`harness/build/history-confirmed-location-evidence/`。上轮发布证据：`harness/build/2026-10-04-history-production-release.md`；历史性能根因见 `harness/build/2026-10-04-history-performance-investigation.md`
- Historical State: v0.2B-1 complete; v0.2B-2 Phase B evidence complete, visual relevance mixed; Phase C photo authorization remains ambiguous and Production Photo implementation is blocked. v0.2C provider page 2 is locally implemented and live verification was user-reported as passed. v0.2D raw provider business-hours display is implemented locally. 交通 v1 实现和发布前置授权为较早阶段记录，不作为本轮历史优化实施或部署的授权。
- Historical Plan: `harness/build/2026-09-11-v0.1C-deployment-plan.md`
- Plan: `harness/build/2026-09-14-v0.2C-provider-pagination-plan.md`
- Implementation Plan: `harness/build/2026-09-12-v0.2B-1-result-card-enrichment-implementation-plan.md`
- Prior Next Action (historical, superseded): 提交/推送本轮已验收版本，沿现有master→Vercel上线并验证真实持久化回放；生产新增字段迁移已完成。偶发历史更新失败的根因与出现频率留待后续实际浏览器评估，本轮不追加机制修复。Any open-now inference requires a separate task and approval. Photo work remains blocked: do not implement photos, add photo caching/proxy/storage, or alter Production configuration without separate authorization. Transit enrichment remains out of scope: do not add `/v3/bus/*`, routes, timetables, or fuzzy station deduplication.
- Deferred: 历史记录跨刷新持久化缓存、数据库/区域/连接配置调整、偶发更新失败的后续评估；v0.2B-2 POI photos remain blocked pending Phase B visual-relevance and authorization evidence; provider pagination beyond page 2; favorites, custom categories/templates, hotel offers, maps, multi-provider, AI, and recommendation work. 较早记录中的“persistence 未实现”与当前 PostgreSQL 历史代码不符，不再用作当前项目事实。
