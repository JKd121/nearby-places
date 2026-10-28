# Project Harness

## POI 2.0 多类别联合查询隔离实验 V1（2026-10-28）

- 本轮授权已扩展为整理实验专用分支、提交并创建面向 master 的独立 Draft PR。Stage C PR #25 已合并，基线为 `31adccd`；沿用当前 checkout，保留其他任务的未提交修改，不新增 Worktree，不合并或部署。
- 实验入口 `scripts/experiments/poi-union/`；默认 Dry，Mock 采用假响应，Live 需要单独授权参数、私有三地点配置、既有 PostgreSQL 准入及固定的一次性 9 次预算锁。生产搜索调度、解析、API、UI、额度与 QPS 均未改。
- 当前实现与验证记录见 [交付证据](harness/build/2026-10-28-poi-union-v1.md)，操作说明见 [实验 README](scripts/experiments/poi-union/README.md)。报告只保留明确 typecode 归属和安全聚合，父子编码映射不足处保持未确认。
- 下一步为独立源码与安全审查；真实采集、后续分析与生产策略设计均未授权，PR 创建后停止。下方 Stage C 等记录保留其历史语境，不扩大本轮范围。

## Stage C 搜索异常传播（2026-10-28）

- 本地实现集中错误分类、部分结果保留、未执行类别和停止事件；不改变数据库准入算法、QPS、额度或串行策略。
- 当前工作提交供 PR 审查，不代表已合并、生产部署或故障根因已解决。故障及待调查项见 [Issue #24](https://github.com/JKd121/nearby-places/issues/24)，本地验证见 `harness/build/2026-10-28-stage-c-local.md`。
- 以下内容为历史阶段快照，不代表当前状态或新授权。

## 当前任务：高德请求安全工程 Stage A（2026-10-25）

- Branch / Baseline: `高德请求安全基线` / `df84cf2f6f788596a6e5e2de418b6ad38d515313`（UI PR #19 合并提交）；当前目录，无新增 Worktree。旧 `界面开发` 分支及性能 Worktree 原样保留。
- Workflow State: LOCAL_GIT_DELIVERY — 用户确认Stage A v2（含64KiB补丁）独立审查通过、无新增P1/P2阻止Preview，并仅授权当前分支本地提交。提交前重新验证受审源码哈希及npm test/check/build；本地提交后停止等待Preview授权。此前浏览器14/20项为历史证据，未执行Preview验收。
- Approved Scope / Source: 本聊天Stage A实施及入站补丁授权；最新用户明确“Stage A v2独立代码审查通过”并批准本地Git交付。允许当前分支提交已审代码、测试和必要说明，不允许推送、PR或部署。
- Scope: 浏览器取消/旧响应保护、三个 Route 的完整生命周期、统一高德传输、独立单次/整体超时、实际字节限读、终止异常/安全消息、全失败分类、最小预算接入口契约及隔离回归；用户追加批准三个高德Route的64KiB入站正文限制与独立413，未扩展其他接口。
- Non-goals: 数据库/schema/迁移/预算扣减、并发调度、WAF、真实高德smoke、平台配置、Issue/PR/推送/部署或新分支/Worktree。UI、历史回放、搜索策略、排序、串行及500ms间隔保留。
- Evidence / Detail: `harness/build/2026-10-25-request-safety-stage-a.md`、`harness/build/2026-10-25-stage-a-inbound-body-limit.md`、`harness/build/request-safety-stage-a-inbound-evidence.json`；本次重验命令记录 `harness/build/request-safety-stage-a-local-delivery.json`。两个完整审查包仅为本地附件，不纳入Git交付；生成目录、环境文件和原始日志不暂存。
- Parameters: `src/amap/policy.ts`集中定义8s/60s/1MiB/入站64KiB候选默认值，部署即生效但尚未批准为正式生产参数；60秒为应用时限，不是宿主300秒上限。64KiB限制应用接受/累计的字节，不等于网络/运行时内存峰值。不修改真实环境配置。
- Coordination: 性能分支 `周边搜索性能优化` / `0ec6ebe` 未改动。复用其 `src/diagnostics.ts` 注入契约并保持主要诊断参数位置，未合并诊断日志/Route包装或性能调度。
- Next Action: 本地提交交付后等待下一步Preview授权，不推送、不创建PR、不部署、不启动B/C/D。Preview重点验证真实Vercel断连及候选参数；beforeAttempt预算/数据库终止协议留待Stage B，AST范围暂不调整。本地提交标识以当前分支git log为准。

## UI 任务历史记录（下列状态不作为当前授权）

## 当前任务：UI 工作台改版（2026-10-24）

- Branch / Baseline: `界面开发` / `3bc08d4`（最初由Agent以`codex/ui-neubrutalism`从当时的`origin/master`建立，后续核对发现分支已改名；沿用现名，未再次切换/重命名；当前目录，无新增 worktree）。
- Workflow State: REVIEW/VERIFY PASS — UI_FINAL_HANDOFF。用户已完成人工视觉验收；最终代码审查及重新执行的103项测试、check/build通过。准备提交当前分支并创建指向master的PR；合并和正式部署必须等待人工确认。
- Approved Scope / Source: 用户认可导航版后明确“可以，我认可这一版。继续做吧”，特别要求搜索、提醒、错误和重试全部使用同一新组件系统。该后续授权取代此前仅导航预览的阶段边界，覆盖既有方案的本地前端实施与验证，不包含发布。
- Current Plan: `harness/build/2026-10-24-ui-neubrutalism-design-plan.md`，最新完成记录优先于其中保留的早期提案/导航阶段历史。
- Confirmed Design Revision: 候选/附近结果共用有界纵向滚动面板并互斥；工作空间/个人空间、240/72px折叠导航及底部空设置；个人中心有完整静态布局，不关联业务函数。已实现。
- Evidence: `harness/build/ui-workspace-evidence/README.md`、实际桌面/候选/个人中心/错误/手机截图、browser-checks.json、fixture-evidence.json、handler-preservation.json。最终版本103/103测试、npm run check、npm run build与git diff --check通过；关键浏览器流程使用受控provider和内存历史。后端/API/schema/依赖/环境配置未改；没有重跑真实高德/数据库smoke。
- Navigation Preview Evidence: `harness/build/ui-navigation-preview-evidence/README.md`、实际展开/折叠/390px截图与`browser-checks.json`。本地<http://localhost:3108/ui-preview>；1440px下240/72px，390px下72px；check/build通过，控制台warn/error为空。仅新增`app/ui-preview/`，现有页面、业务代码、schema和依赖清单保持原样。
- Latest Tiny Edit: 按用户要求新增底部齿轮“设置”占位行，展开有文字、折叠仅图标，不关联任何操作。改后`npm run check:web`及实际浏览器检查PASS；截图`desktop-settings-expanded.png`；全量build结果为此前导航版本，本小改未重复运行。
- Active Approval: 用户明确“UI开发已完成人工视觉验收”，要求小范围最终审查、重新执行npm test/check/build；全部通过可在当前界面开发分支提交并按既有GitHub流程准备合并master。严禁擅自合并/正式部署、新建Worktree或无关分支。未发现需扩大修复的业务风险。
- Latest Review Evidence: `harness/build/ui-workspace-evidence/final-code-review.md`。fetch后origin/master仍为3bc08d4；独立只读审查及主Agent复核通过；三个fetch请求体和13个主要处理函数保持，未发现本次UI引入额外高德请求。原UI规划/截图/受控证据完整保留；构建缓存、环境文件与原始测试日志不提交。
- Next Action: 当前分支提交并准备PR，等待用户对合并/正式部署的人工确认；不得自动执行该门禁之后的操作。请求安全Stage A的技术方案已从聊天“规划请求链路与高德额度保护”恢复；按用户指定顺序，UI交付结束后再启动，不混入UI提交或PR。当前尚未执行Stage A代码、数据库或WAF改动；不新建分支/Worktree。
- Coordination: 性能分支也改动`src/web/SearchApp.tsx`，合入前须核对其诊断逻辑；`b368`工作区保留。原历史分支仍在；Preview未提交记录已保存到stash commit `37432f8dd750c5e1f295e9d6eaa1956b58d5d46c`，不恢复进本轮UI提交。
- Recovery Note: 下方为主分支继承的历史记录，包含过时的“发布进行中”描述，不作为当前任务状态或新授权。历史发布已完成的归档仍在`codex/history-confirmed-location`上的`16503c1`；不为本轮设计复制/覆盖该分支成果。

## 继承的历史记录（非当前任务状态）

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
