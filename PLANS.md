# Project Harness

- Project: 地点周边生活服务聚合器
- Repository: `C:\Users\lenovo\Documents\ChatGPT\地点聚合器`
- Released Baseline: v0.1C COMPLETE
- Current State: v0.1C is complete. v0.2A Checkpoint 4 passed locally and the feature branch release commit was pushed, but Preview deployment verification is currently blocked because no Preview URL or Vercel deployment access is available in this process.
- Active Approved Phase: v0.2A PRODUCTION VERIFICATION
- Current Workflow State: V0.2A_PRODUCTION_VERIFICATION_BLOCKED
- Historical Plan: `harness/build/2026-09-11-v0.1C-deployment-plan.md`
- Plan: `harness/build/2026-09-11-v0.2A-location-intent-resolution-plan.md`
- Implementation Plan: `harness/build/2026-09-11-v0.2A-implementation-plan.md`
- Next Action: Provide or expose the Vercel Preview deployment for commit `e0f741d` with server-side `AMAP_WEB_SERVICE_KEY`, then run the bounded six-case Preview smoke. Do not merge master, deploy production, or enter a later phase until Preview verification passes. Nearby Search remains unchanged; keep provider pagination, favorites, maps, database, hotel pricing, custom categories, and other v0.2 work frozen.
- Deferred: v0.2A P0-1 ambiguous location resolution / multiple same-name POI candidate selection and P0-2 real provider pagination beyond the first 25 results per category; v0.2 persistence; v0.3 custom categories/templates; hotel offers; maps/details/navigation; multi-provider, AI, and recommendation work.
