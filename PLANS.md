# Project Harness

- Project: 地点周边生活服务聚合器
- Repository: `C:\Users\lenovo\Documents\ChatGPT\地点聚合器`
- Released Baseline: v0.1C COMPLETE
- Current State: 2026-10-04 历史记录体验方案已完成本地实施、自审和验证；97/97测试、类型检查、生产构建及实际Chrome浏览器验证通过。用户已真人浏览器验收并明确确认本轮优化完成，授权本地Git提交。尚未部署。
- Active Approved Phase: History Experience — Implementation, Review and Verification
- Approval Source: 本聊天用户在审阅具体方案后明确确认“批准现在的方案”。
- Current Workflow State: COMPLETE — HISTORY_EXPERIENCE（本地交付）
- Current Plan: `harness/build/2026-10-04-history-experience-plan.md`
- Current Evidence: `harness/build/2026-10-04-history-experience-verification.md`；根因见 `harness/build/2026-10-04-history-performance-investigation.md`
- Historical State: v0.2B-1 complete; v0.2B-2 Phase B evidence complete, visual relevance mixed; Phase C photo authorization remains ambiguous and Production Photo implementation is blocked. v0.2C provider page 2 is locally implemented and live verification was user-reported as passed. v0.2D raw provider business-hours display is implemented locally. 交通 v1 实现和发布前置授权为较早阶段记录，不作为本轮历史优化实施或部署的授权。
- Historical Plan: `harness/build/2026-09-11-v0.1C-deployment-plan.md`
- Plan: `harness/build/2026-09-14-v0.2C-provider-pagination-plan.md`
- Implementation Plan: `harness/build/2026-09-12-v0.2B-1-result-card-enrichment-implementation-plan.md`
- Next Action: 按用户授权完成本地Git提交；偶发历史更新失败留待实际部署后的浏览器评估，根因未确认，未授权本轮修复或发布。Any open-now inference requires a separate task and approval. Photo work remains blocked: do not implement photos, add photo caching/proxy/storage, or alter Production configuration without separate authorization. Transit enrichment remains out of scope: do not add `/v3/bus/*`, routes, timetables, or fuzzy station deduplication.
- Deferred: 历史记录跨刷新持久化缓存、数据库/区域/连接配置调整、发布部署；v0.2B-2 POI photos remain blocked pending Phase B visual-relevance and authorization evidence; provider pagination beyond page 2; favorites, custom categories/templates, hotel offers, maps, multi-provider, AI, and recommendation work. 较早记录中的“persistence 未实现”与当前 PostgreSQL 历史代码不符，不再用作当前项目事实。
