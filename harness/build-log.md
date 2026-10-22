# Harness Build Log

## 2026-10-23 — Issue #7 local delivery verified

- Reused clean PR #5 branch at `c66dfdc` in the designated Windows Worktree. Implemented bounded Explore interactions first, then authorized shell/Home/History/My Places visual refinement.
- Retained resolver/search/history core, categories/radii, filters/sorts, local reveal/Provider page 2 and AMap links. No production API/schema/CI-trigger changes or original-checkout writes.
- Final lint/types/build PASS, 103 existing tests PASS, 14 browser tests PASS. Captured 18 before / 25 after actual desktop/mobile/tablet PNGs in a separate Issue #7 evidence directory.
- Fresh independent code/visual review found a resolver-condition concurrency issue; corrected and regression tested. Limited final verdict scored the correction resolved (`ship`) and confirmed auxiliary contrast. Read-only documentation handoff completed.
- Scope, failed-run history, exact final checks and boundaries: `build/2026-10-23-issue-7-explore.md`; comparisons/manifest/report: `build/issue-7-evidence/`.
- Next: commit/push existing branch, update PR #5, human review. No merge or production deployment.

## 2026-10-22 — Issue #4 local delivery verified

- Shared shell/four routes implemented; search and history core retained; no map/auth/favorites backend or schema/CI changes.
- 103 existing tests, type checks and production build PASS. Final isolated Chrome browser suite 7/7 PASS; 18 desktop/mobile/tablet PNGs captured.
- Independent code/visual review found no blocking production regression. A screenshot scroll-position artifact was recaptured and the reviewer confirmed it resolved.
- Exact scope, evidence and dependency-audit limitations: `build/2026-10-22-issue-4-package-1a.md` and `build/issue-4-evidence/verification.json`.
- Delivery boundary: commit/push branch and create PR only; no master merge or production deployment.

## 2026-10-22 — Issue #4 / Package 1A entry

- Sole task specification: GitHub Issue #4; direct user authorization covers implementation and branch PR, excludes merge/production deployment.
- Designated worktree and branch verified clean at required base `3bc08d4`; original checkout untouched.
- Scope/visual contract/verification plan: `build/2026-10-22-issue-4-package-1a.md`.
- Existing historical release records below remain intact and do not authorize new deployment actions.

## 2026-10-05 — 已授权历史直接搜索本地实施与验收

- 用户明确“我确认授权”，覆盖完整本地方案的实施、自审和验证。
- 实现confirmedLocation完整保存/读回、拒绝缺失中心、中心坐标去重、最近10/20有效记录过滤、点击历史直接search并显示新结果。旧行保留，列表仅显示完整记录。
- 页面历史显示确认名称和地址；请求进行中允许使用历史与编辑输入，过期响应不覆盖结果或保存历史。两项浏览器发现后的修正均重新自审和验证。
- 最终npm test103/103、npm run check、npm run build、Prisma generate/validate及diff检查通过；实际浏览器刷新回放、同输入不同中心、快速切换、编辑输入、失败/部分成功、键盘及390/1280px检查通过。
- 浏览器使用真实production UI、真实history route/service/repository与search validator/service，DB和高德边界提供隔离内存/合成数据。没有把该证据作为真实PostgreSQL或高德集成证据。
- 迁移仅新增可空JSONB字段，未在在线数据库执行。没有可用本地PostgreSQL/psql/Docker，真实持久化未验证；未Git提交、推送或部署。
- 本地交付完成，证据：`harness/build/2026-10-05-history-confirmed-location-verification.md`及`history-confirmed-location-evidence/`；下一步审阅，再确定线上迁移和发布范围。

## 2026-10-05 — 旧数据处理确认与实施方案定稿

- 用户接受保留旧数据库记录，列表只显示可直接搜索的完整记录；没有授权删除旧数据或猜测原中心。
- 同一方案已定稿：完整地点保存/读取校验、确定中心直接周边查询、中心加入去重、最近10/20完整记录过滤、跨刷新及异步回归。
- 本轮建议交付本地实现、迁移文件、自审和实际验证；在线数据库迁移及发布不自动包含。真实数据库无隔离验证环境时准确披露缺口。
- 当前AWAITING_PLAN_APPROVAL；尚未实施，变更后gates、浏览器及数据库验收NOT RUN。

## 2026-10-05 — 历史地址完整性硬约束

- 用户否定旧记录“需补确认/重新搜索”降级，要求保存能恢复周边搜索能力的全部地址信息。已将每条可点击历史必须可直接搜索设为确认要求。
- 方案增加写入必需地点对象、读回全部已确认字段及非法信息校验；不以重新解析或候选选择弥补缺失数据。
- 旧数据从未保存原选择，无法准确还原。已提出保留数据库数据、隐藏不完整历史的兼容建议并询问用户，尚未确认；未隐藏、删除或修改数据库记录。
- 当前仍为CLARIFY，方案与验收更新于同一草案；无功能实现，新验收NOT RUN。

## 2026-10-05 — 历史记录直接周边搜索需求确认

- 用户确认：保存已确认地点，点击历史跳过地点解析/候选确认，按确定中心查询最新周边；不保存或恢复历史结果状态。
- 已核对 schema、history GET/POST/service/repository、前端回放与现有 confirmed search 链路；现有周边接口可直接复用。现有历史缺少中心，且去重忽略地点选择。
- 已核对高德官方 v5 around 文档及本地 Next Route Handlers 指南；推荐保存完整 LocationCandidate，以原坐标直接搜索，POI ID 为可空元数据。
- 旧记录缺少原确认信息，已向用户询问保留补确认一次或保留但提示重新搜索，未默认推断中心或删除记录。
- 方案草案：`harness/build/2026-10-05-history-confirmed-location-plan.md`。状态 CLARIFY；需求确认不等于本轮实施授权。仅更新 Harness，功能代码、数据库和发布均未修改；新验收均 NOT RUN。

## 2026-10-04 — 历史体验优化推送与正式部署完成

- 新授权：用户明确“将本次的修改进行推送和部署”。覆盖已验收历史优化38f39ea的现有Git/Vercel发布路径；不扩展到环境、数据库、DNS或其他功能。
- 38f39ea已推送release/search-history；确认master58a76fd与b69d92d基线tree相同后创建并合并PR #2，expected_head_sha固定38f39ea。正式merge为de432ca，正式tree与本地验收tree一致。
- GitHub的Vercel正式部署CsyAhtCe6GaVdrtJuMFX6XheZVnA状态success；nearby.durunqian.com首页200、新bundle已包含缓存/逐项恢复，非法limit=21变为400。
- 实际生产API用新隔离测试访客完成2条记录保存、读回、归属404、删除持久化并全部清理；内置浏览器打开/重新打开历史空状态正常、error/warn为空。未执行真实高德搜索或长期故障频率测试。
- 证据：harness/build/2026-10-04-history-production-release.md、production-smoke.json和production-browser.png。本地验收观察的偶发更新失败保留ROOT_CAUSE_UNKNOWN，不由此次有界检查判为已修复。
- 结果：COMPLETE — HISTORY_EXPERIENCE_DEPLOYED；本条及发布证据在发布后记录到本地Harness。

## 2026-10-04 — 用户真人验收确认完成并授权本地Git提交

- 用户在localhost:3106验收后明确确认历史记录加载/删除体验优化完成，并要求检查工作树、分支和提交前状态后进行Git提交。
- 当前分支release/search-history，HEAD为b69d92d；起始暂存区为空，没有未解决冲突或进行中的merge/rebase/cherry-pick。工作树并非Clean：本轮改动及原有未跟踪学习资料文档仍在工作树。
- 提交范围：本轮历史代码、专项测试、计划和验收证据共20个文件；学习资料/前后端分层与交互学习笔记.docx保留且不加入提交。沿用当前分支，无需checkout切换，不清理或丢弃已有文件。
- 提交前核对5个运行时文件SHA256，均与最终97/97、check/build及浏览器验收版本一致；本轮仅补充验收/授权记录。执行差异检查、冲突标记及密钥模式检查，未发现阻止提交的问题。
- 偶发历史更新失败：根因和出现频率尚未确认；用户明确留待部署后真实浏览器评估。未将其定性为浏览器交互错误，未追加实现或部署。
- 用户授权为本地提交；没有远程push或部署授权。提交结果以Git历史及提交后的status为准。

## 2026-10-04 — 已批准历史体验方案实施、自审与验收

- 授权：用户明确“批准现在的方案”，接受所示范围、缓存策略和验收指标。未重复要求批准，未扩展到部署。
- 实施：页面独立内存缓存与200 ms预读、20/10备用及展示、即时删除与每项恢复、GET去重和读写协调、8秒请求超时；使用POST真实响应同步。GET支持10/20，新访客空读跳过数据库。
- 自审修复：失败操作不触发无谓补位；满20条的新窗口不覆盖删除目标时不能推断成功，保留原记录。修复后重新测试、构建并取得最终浏览器证据。无独立审查人员。
- 最终gates：npm test 97/97 PASS；npm run check PASS；npm run build PASS；git diff --check PASS。
- 最后样式审查修复重试悬停对比度后，再次通过97/97、check与build；更新构建取得390 px悬停截图、实际重试恢复和缓存打开26.8 ms/删除31.5 ms复验。状态逻辑及正常面板样式不变，具体证据版本见验收记录。
- 真实Chrome154：缓存重开30次p95 14.3 ms、预读完成首开30次p95 25.1 ms、删除补位30次p95 18.9 ms，全部≤100 ms；GET/DELETE人为延迟1500 ms。早点击5次加载提示≤11.7 ms、仅一份GET，实际数据仍需约1.5秒。
- 浏览器失败恢复、连续删除、空状态、8秒超时、回放、实际鼠标/键盘，以及390/1280视口验证通过。远程历史API用隔离测试访客验证12条备用、默认10条、归属404和删除持久化，测试记录全部清理。
- 证据：harness/build/2026-10-04-history-experience-verification.md 与 history-experience-evidence/。Firefox/Safari及真实高德smoke未运行；不宣称跨浏览器或远程首开秒数保证。
- 结果：COMPLETE（本地）；没有新增依赖、数据库/连接配置变更、提交或部署。

## 2026-10-04 — 历史体验需求确认与设计/PLAN

- 用户确认：改善首次/再次打开与删除；已有缓存立即显示、删除立即消失、首次无缓存允许短暂加载。用户明确授权进入设计和 PLAN，未批准实施。
- 调研实际实现：Algolia Autocomplete recent-searches（修订 16de34447bab8fab121a8cef114144062cd056d3）与 SWR mutate（修订 9ed1240a4cf799e316a793c22c6800cc6482d389），检查了源码与 MIT 许可。采用成熟交互模式的有限实现建议；未安装依赖或复制外部源码。
- 本地指导：读取 Team Workflow 及 Frontend Design Pipeline，核对安装的 Next.js 文档。普通列表交互使用现有视觉体系，未引入其他设计能力或子 Agent。
- 方案：`harness/build/2026-10-04-history-experience-plan.md`。包括页面内存缓存、后台预读、最近 10/最多 20 备用、局部即时删除、每项失败恢复、并发/身份协调及真实浏览器性能验收。
- 100 ms/30 秒/8 秒等建议值、预读成本及有限 GET 扩展均为待批准方案，不能作为已确认或已达标事实。
- 当前：AWAITING_PLAN_APPROVAL；仅更新计划与状态记录。优化后测试、代码审查和浏览器验收均 NOT RUN；上轮 84/84 是旧版本基线。

## 2026-10-04 — 历史记录性能只读排查

- 用户授权：复盘首次打开与删除后的慢响应；未授权本次实施修复或部署。
- 证据与结论：`harness/build/2026-10-04-history-performance-investigation.md`。
- 确认每次打开均重新读取、读取时隐藏已有列表、DELETE 后串行等待 GET、所有删除按钮等待补位请求完成。
- 实际 Prisma 首次查询 2037 ms，随后 266–267 ms；SQL 内部执行 0.401 ms。pg 空闲 11 秒后实测重新建连，读取 1945 ms，随即读取 276 ms。
- 线上只读 GET：1807 / 558 / 261 / 246 ms，均 HTTP 200；平台冷启动占比和跨浏览器差异未验证。
- 前端控制流模拟断言通过；`npm test` 84/84 PASS。没有修改功能代码、数据库记录或部署配置。
- 调查完成；修复方向为保留现有列表、删除局部更新与后台补位，并核查首次读取的连接路径。

## 2026-09-10 — Initial bootstrap

- Repository root: `C:\Users\lenovo\Documents\ChatGPT\地点聚合器`
- Baseline HEAD: NONE (repository has no commits)
- Initial Git status: `master`, no commits, untracked `.serena/`
- Discovered project documents: none; README missing; package manifest missing; specification files missing
- Created Harness artifacts: `AGENTS.md`, `PLANS.md`, `harness/build/`, `harness/build-log.md`
- Business implementation performed: none
- Result: `PROJECT_BOOTSTRAP_APPROVED` → `CLARIFY`

## 2026-09-10 — AMap Spike local implementation

- Approved phase: AMap Web Service data-capability Spike only
- Added: minimal Node.js/TypeScript metadata, AMap category/client/types/distance modules, smoke script, focused unit tests, environment example, and README
- `npm test`: PASS (5/5)
- `npm run check`: PASS
- `npm run build`: PASS
- `npm run smoke` without `AMAP_WEB_SERVICE_KEY`: expected FAIL with exit code 1 and an explicit missing-key message
- Dependency audit during install: 0 vulnerabilities
- Real Shenzhen/Hong Kong API calls: NOT RUN; key unavailable
- Result: implementation and local verification complete; full acceptance `BLOCKED` pending a real key

## 2026-09-10 — QPS and Hong Kong geocode-validation correction

- Root cause: `Promise.all(CATEGORIES.map(...))` launched all eight Around requests concurrently, creating the observed QPS burst.
- Request strategy: sequential category loop with an injected 500 ms delay between adjacent Around attempts, including after failed attempts; no delay after the last category.
- Hong Kong input: changed to `香港特别行政区九龙达之路香港城市大学`.
- Validation: geocode output now includes address/province/city/district/location/level; an obvious non-Hong-Kong administrative match skips all Around requests and reports `geocode validation failure` with returned details.
- `npm test`: PASS (8/8)
- `npm run check`: PASS
- `npm run build`: PASS
- `npm run smoke` without `AMAP_WEB_SERVICE_KEY`: expected FAIL with exit code 1 and explicit missing-key message
- Review: no concurrent Around aggregation, retry, backoff, scheduler, queue, third-party rate limiter, new runtime dependency, or product/UI scope found
- Real Shenzhen/Hong Kong retest: NOT RUN; key unavailable in this task process
- Result: correction locally verified; real API verification remains `BLOCKED` pending key injection
## 2026-10-05 — 历史直接搜索人工验收

- 用户在 `http://localhost:3107/` 隔离测试入口核验后回复“通過”，本地交互人工验收通过。
- 本次为内存数据库与合成高德数据环境；真实数据库持久化、高德集成及线上迁移/发布仍未验收或执行。
- 仅更新验收与项目状态记录，没有修改功能代码或新增上线授权。
