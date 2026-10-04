# Harness Build Log

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
