# Project Harness

- Project: 地点周边生活服务聚合器
- Repository: `C:\Users\lenovo\Documents\ChatGPT\地点聚合器`
- Released Baseline: v0.1C-1 PASS_WITH_KNOWN_INTERMITTENT_INCIDENT
- Current State: v0.1C-1 temporary Vercel production deployment passed bounded Desktop, mobile cellular, Mainland, Hong Kong, QPS, timeout, and secret-isolation verification. v0.1C-2 custom-domain configuration is user-confirmed valid: Vercel domain status valid, Cloudflare DNS configured, DNS-only proxy, and no unrelated DNS changes.
- Active Approved Phase: v0.1C-2 IMPLEMENT only (custom-domain verification; no business-code or DNS changes in this step)
- Current Workflow State: WAITING_FOR_CUSTOM_DOMAIN_VERIFICATION
- Plan: `harness/build/2026-09-11-v0.1C-deployment-plan.md`
- Next Action: Complete real custom-domain verification for HTTPS, Desktop, mobile cellular, Shenzhen, Hong Kong, filters/sorting/load-more, error status, secret isolation, and the existing `*.vercel.app` fallback. Do not modify DNS or application code further. If all checks pass, record `v0.1C-2: PASS` and `v0.1C: COMPLETE`, then stop before v0.2.
- Deferred: v0.2 persistence; v0.3 custom categories/templates; hotel offers; maps/details/navigation; multi-provider, AI, and recommendation work.
