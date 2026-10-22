# Project Harness

## Current phase — Issue #8 Stage A / approved SVG prototype

- Authority: https://github.com/JKd121/nearby-places/issues/8 and user's explicit Stage A implementation request; subsequent instruction authorizes switching/creating its independent Worktree.
- Worktree: `C:\Users\lenovo\.codex\worktrees\nearby-explore-prototype\地点聚合器`; branch `codex/nearby-explore-prototype`; entry c46fac4452cb6cceab0d2edf88350302e733c7ee, clean, equal to remote. SVG blob af7d2ff764c1645061950df38d7808ac54dd25f6 matches design branch and has been viewed in a browser.
- State: STAGE_A_READY_FOR_VISUAL_REVIEW. Scope/design/verification: `harness/build/2026-10-23-issue-8-stage-a.md` and `harness/build/issue-8-stage-a-evidence/README.md`. Next: prototype-only draft preview/review handoff; await product-owner approval, never auto-enter Stage B.
- Boundary: runnable isolated visual prototype, screenshots and review handoff only. Do not connect business APIs or enter Stage B before explicit approval; do not change PR #5/master/production.
- Latest Stage A amendment: PR #9 comment6348830035 and Issue #8 updated2026-10-22T18:58:08Z approve only the desktop500/720 split, retaining tablet/phone strategy. Entry490c7d6 was clean/equal remote. Current verification/evidence: `harness/build/issue-8-stage-a-ratio-evidence/README.md`; await renewed visual review after this revision.

## Previous phase — Issue #7 / Explore interaction and visual refinement

- Sole current task source: https://github.com/JKd121/nearby-places/issues/7. User authorized implementation on PR #5's existing branch and updating that PR; no merge or production deployment.
- Workspace/branch: `C:\Users\lenovo\.codex\worktrees\nearby-v2-1-package1\地点聚合器` / `codex/nearby-v2.1-package1`; entry `c66dfdcd2dafd43d768b9867adaa6bdc7550e596`, clean and equal to remote/PR head.
- State: LOCAL_VERIFIED. Scope, design reference contract, ordered acceptance and evidence: `harness/build/2026-10-23-issue-7-explore.md` and `harness/build/issue-7-evidence/verification.json`.
- Next action: commit/push this existing branch and update PR #5 with final comparisons and checks; await human review. Preserve existing APIs/search/history, original checkout and historical evidence; no master merge or production deployment.

## Previous phase — Issue #4 / Package 1A

- Task source: https://github.com/JKd121/nearby-places/issues/4. User explicitly requested implementation and a branch PR, without merge or production deployment.
- Workspace: `C:\Users\lenovo\.codex\worktrees\nearby-v2-1-package1\地点聚合器`.
- Branch/base: `codex/nearby-v2.1-package1` / `3bc08d4f7636b72c7206f1d9e4cb6272c212e41b`.
- State: LOCAL_VERIFIED — implementation, independent review and browser evidence passed; branch PR handoff. Scope and executed results: `harness/build/2026-10-22-issue-4-package-1a.md`, `harness/build/issue-4-evidence/verification.json`.
- Approved: four-page shared shell, retained Explore search/history, real recent-history Home/History surfaces and honest My Places empty state, responsive browser evidence and issue-related documentation.
- Excluded: real map/markers/linkage, authentication, favorites/list persistence, schema/migrations, unrelated refactors, production config and CI/Preview trigger changes.
- Original checkout remains at `16503c1` with its existing local changes. Its unpublished release/Preview evidence is not copied or deleted here. This worktree's historical records below can lag that evidence; do not restart old release operations.
- Next action: deliver the verified branch as a PR to master for human review. The created PR URL belongs to the task attachment/report. No merge or production deploy.

## Previous phase — historical record, not current instructions

- Project: 地点周边生活服务聚合器
- Repository: `C:\Users\lenovo\Documents\ChatGPT\地点聚合器`
- Released Baseline: v0.1C COMPLETE
- Current State: 2026-10-05 历史直接搜索本地实现及人工验收通过，103/103、check/build/schema及实际浏览器通过。用户已授权上线；生产confirmedLocation迁移成功，14条旧记录数量/摘要未变。应用发布及真实链路验证进行中。此前偶发历史更新失败根因仍未确认。
- Active Approved Phase: History Confirmed Location — 生产迁移、发布与验证
- Approval Source: 本聊天用户在完整方案展示后明确“我确认授权”，人工核验后回复“通過”，继而明确要求“进行上线部署”；当前授权覆盖已验收范围的必要数据库迁移、Git提交/推送、正式部署和生产核验。
- Current Workflow State: IMPLEMENT — HISTORY_CONFIRMED_LOCATION_RELEASE（用户已人工核验通过并授权“进行上线部署”；迁移、发布及真实链路验证进行中）
- Current Plan: `harness/build/2026-10-05-history-confirmed-location-release.md`（用户授权上线）；实施计划：`harness/build/2026-10-05-history-confirmed-location-plan.md`；上轮已完成计划：`harness/build/2026-10-04-history-experience-plan.md`
- Current Evidence: `harness/build/2026-10-05-history-confirmed-location-verification.md`；`harness/build/history-confirmed-location-evidence/`。上轮发布证据：`harness/build/2026-10-04-history-production-release.md`；历史性能根因见 `harness/build/2026-10-04-history-performance-investigation.md`
- Historical State: v0.2B-1 complete; v0.2B-2 Phase B evidence complete, visual relevance mixed; Phase C photo authorization remains ambiguous and Production Photo implementation is blocked. v0.2C provider page 2 is locally implemented and live verification was user-reported as passed. v0.2D raw provider business-hours display is implemented locally. 交通 v1 实现和发布前置授权为较早阶段记录，不作为本轮历史优化实施或部署的授权。
- Historical Plan: `harness/build/2026-09-11-v0.1C-deployment-plan.md`
- Plan: `harness/build/2026-09-14-v0.2C-provider-pagination-plan.md`
- Implementation Plan: `harness/build/2026-09-12-v0.2B-1-result-card-enrichment-implementation-plan.md`
- Next Action: 提交/推送本轮已验收版本，沿现有master→Vercel上线并验证真实持久化回放；生产新增字段迁移已完成。偶发历史更新失败的根因与出现频率留待后续实际浏览器评估，本轮不追加机制修复。Any open-now inference requires a separate task and approval. Photo work remains blocked: do not implement photos, add photo caching/proxy/storage, or alter Production configuration without separate authorization. Transit enrichment remains out of scope: do not add `/v3/bus/*`, routes, timetables, or fuzzy station deduplication.
- Deferred: 历史记录跨刷新持久化缓存、数据库/区域/连接配置调整、偶发更新失败的后续评估；v0.2B-2 POI photos remain blocked pending Phase B visual-relevance and authorization evidence; provider pagination beyond page 2; favorites, custom categories/templates, hotel offers, maps, multi-provider, AI, and recommendation work. 较早记录中的“persistence 未实现”与当前 PostgreSQL 历史代码不符，不再用作当前项目事实。
