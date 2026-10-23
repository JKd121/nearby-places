# Issue #12 — 页面内地点候选 / 单步修复

唯一范围：[Issue #12](https://github.com/JKd121/nearby-places/issues/12)。复用PR #11的Stage B Worktree/分支，入口a5cfc93221c299536944141d7c0d29a8df45bab3，clean且等于PR及远端。没有换分支、创建平行实现或合并其他分支。

## 修改及限制

- `src/web/SearchApp.tsx`：只移除地点候选ExploreDialog，在原输入下方以正常文档流展开有界候选区域；保留前5/查看更多及Issue #6。确认后移除候选与表单，只留原地点摘要/修改入口；修改恢复原query及焦点，不重开旧候选。not_found也内联。新增区域焦点、查看更多后焦点和Escape收起，保留明确候选点击、requestId及完整历史直接回放。
- `app/explore.css`：候选专用规则从Dialog移到内联区域，紧凑行/轻背景/内部滚动；只增加必要的地点摘要与手机输入区域规则。没有改其他区域样式。
- `test/browser/inline-candidates.spec.ts`：桌面/手机专属展开→键盘点击确认→收起→修改→重新解析→补充测试，捕获下面四张实际截图及几何。
- 既有 `explore.spec.ts`、`refine-location.spec.ts`、`stage-b.spec.ts`：仅适配候选容器与输入/摘要生命周期；证据输出允许定向到忽略目录，避免覆盖旧验收截图。AGENTS/PLANS只更新本步范围与状态。
- 类别/半径/结果/地图渲染片段与入口完全相同，SHA256均为 `8b690b74b1c011632ec55ad6cf4f43eec484c48ab7abe2ec58dcf3a87998fd95`（`unchanged-regions.json`）。条件/历史Dialog、地图组件、App Shell/导航、API/数据库/搜索历史语义、依赖和CI配置均无改动。新增依赖0。

## 实际浏览器截图

| 视口 | 候选就地展开 | 点击确认后自动收起 |
| --- | --- | --- |
|1440×900|[展开](desktop-expanded.png)|[确认后](desktop-confirmed.png)|
|390×844|[展开](mobile-expanded.png)|[确认后](mobile-confirmed.png)|

截图来自正式 `/explore` 的实际Chrome生产构建；候选是可控测试API夹具，不是本轮真实高德数据。没有生成图、旧截图替代或候选遮罩层。四张截图已打开视觉自检；不是产品负责人的视觉批准。

几何：桌面候选区域340px，确认后顶部区域93px；手机候选区域260px，确认后顶部77px。候选始终在输入下方正常占位，不覆盖地图；长列表内部滚动，查看更多保留，确认后区域从DOM消失。详见desktop/mobile-geometry.json。地图/结果因上方区域收起自然回收空间，其代码和样式不变。

## 执行结果

- `npm run lint` PASS，0 warnings；`npm run check` PASS core/web；`npm run build` PASS完整生产构建。
- `npm test` PASS103/103；最终 `npm run test:browser` PASS27/27，50.4s，0 flaky/skipped；报告提取自最终HTML的 `browser-summary.json`。
- 覆盖Issue #12八场景：多候选无Dialog/遮罩、确认收起/只剩摘要、修改恢复query/焦点、not_found补充、confirmed单候选显式点击、旧响应防覆盖、手机同流程、完整历史直接恢复不显示候选。另回归条件/类别/半径、筛选排序/两种加载更多、搜索错误状态及四路由。
- 首次浏览器23/27：查看更多按钮消失后焦点丢失，补回区域焦点；另一个旧断言错误地要求确认前仍存在摘要，改为不存在。随后lint/types/build及全27例重跑通过，截图重新生成。未将失败运行作为通过证据。
- Diff范围自检及git diff --check通过。真实高德/数据库、物理手机/软键盘未验证；地图仍保留前序明确未接入状态，本步未实施任何地图工作。

仅一个Issue #12独立提交并更新原PR #11，等待下一项人工评审；不合并、不部署生产、不进入下一修复。远端Preview/CI状态见PR #11；原有stacked PR不匹配master CI触发条件，不能将未触发当作通过。
