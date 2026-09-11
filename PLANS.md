# Project Harness

- Project: 地点周边生活服务聚合器
- Repository: `C:\Users\lenovo\Documents\ChatGPT\地点聚合器`
- Released Baseline: v0.1C-1 PASS_WITH_KNOWN_INTERMITTENT_INCIDENT
- Current State: v0.1C-1 temporary Vercel production deployment passed bounded Desktop, mobile cellular, Mainland, Hong Kong, QPS, timeout, and secret-isolation verification. v0.1C-2 custom-domain IMPLEMENT is approved but is stopped before Vercel domain binding because this process has no Vercel authentication.
- Active Approved Phase: v0.1C-2 IMPLEMENT only (custom domain; no business-code changes)
- Current Workflow State: WAITING_FOR_EXTERNAL_AUTH
- Plan: `harness/build/2026-09-11-v0.1C-deployment-plan.md`
- Next Action: Complete official Vercel browser/login authorization, then resume by adding `nearby.durunqian.com` in Vercel and reading its exact DNS instruction. Keep the temporary `*.vercel.app` deployment unchanged; do not modify Cloudflare DNS before that instruction is available.
- Deferred: v0.2 persistence; v0.3 custom categories/templates; hotel offers; maps/details/navigation; multi-provider, AI, and recommendation work.
