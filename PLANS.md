# Project Harness

- Project: 地点周边生活服务聚合器
- Repository: `C:\Users\lenovo\Documents\ChatGPT\地点聚合器`
- Released Baseline: v0.1B
- Current State: v0.1B is complete. v0.1C-1 IMPLEMENT is approved. Local repository hygiene, a redacted secret scan, and the full automated regression/build gate passed; local metadata/raw real-API output are excluded from the first commit and no external resource has been created.
- Active Approved Phase: v0.1C-1 IMPLEMENT only (temporary Vercel production deployment; custom domain excluded)
- Current Workflow State: WAITING_FOR_EXTERNAL_AUTH
- Plan: `harness/build/2026-09-11-v0.1C-deployment-plan.md`
- Next Action: Await the user's exact confirmation `OLD_AMAP_KEY_ROTATED = YES`. Until then, do not stage, commit, push, inspect/use external authentication, create GitHub/Vercel resources, configure the production secret, or deploy. v0.1C-2 remains separately gated on v0.1C-1 PASS.
- Deferred: v0.2 persistence; v0.3 custom categories/templates; hotel offers; maps/details/navigation; multi-provider, AI, and recommendation work.
