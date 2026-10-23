# Issue #10 — Stage B 评审证据

唯一任务依据：[Issue #10](https://github.com/JKd121/nearby-places/issues/10)。已完整读取关联PR #9、PR #5、Issue #6、Issue #8及讨论。正式基线PR #5 `6975b3d`，视觉来源PR #9 `cc88851`；没有合并/整批cherry-pick原型分支。

独立Windows Worktree：`C:\Users\lenovo\.codex\worktrees\nearby-v2-1-stage-b\地点聚合器`；分支 `codex/nearby-v2-1-stage-b`；stacked PR目标 `codex/nearby-v2.1-package1`。原checkout的PLANS改动/未跟踪文件、PR #5及PR #9 Worktree均保留。分文件映射与检查点记录见 `../2026-10-23-issue-10-stage-b.md`。

## 两组独立提交与验收

- B1 `2eb9253`：正式布局及原有业务接入，先通过103 Node测试、lint/types/build及18浏览器测试40.1s，才进入B2。证据 `b1/`、`b1-regression/`，不含UX #6行为变更。
- B2 `761720b`：独立的补充地理关键词与新解析显式确认逻辑；专属 `test/browser/refine-location.spec.ts` 6例。该检查点全套24例48.8s通过；证据 `ux6/`。
- 收尾：补充横栏直接操作的API快照验收，最终全套25例50.7s通过，0 skipped/flaky。最终报告 `final/browser-summary.json`，尺寸/哈希与代码摘要 `final/verification.json`。

### B1 正式布局/业务清单

- [x] 正式 `/explore`，沿用PR #5共享Shell和四路由，不带入原型导航/路由。
- [x] 顶部输入/解析与确认摘要/修改、横向类别/半径/搜索、左侧纵向真实结果、右侧中心/范围状态区；手机地图状态在上、可展开列表在下，无搜索后页面堆叠。
- [x] 实际调用原 `/api/resolve-location`、`/api/search`、`/api/search/page` 与历史通道，保留requestId竞态保护；未改服务/API/数据库/算法。
- [x] 候选查看更多/地址、Dialog键盘/焦点、条件保留、10类别定义/上限和1/2/3/5km不变。
- [x] 筛选、全部适用排序、本地加载更多、Provider第二页失败/重试、高德位置链接、部分/全部失败、空/加载/重试状态回归。
- [x] 历史保存、刷新、删除、Home/History跨路由直接恢复、完整确认中心和条件回放，旧/无效记录安全提示。
- [x] 横栏快速取消酒店及切换2km后实际请求是9类/2000m；清空类别后禁止搜索。

### B2 / Issue #6 清单

- [x] 首次宽泛查询正常解析，不先强制补城市；候选Dialog底部及not_found均有可点击补充入口。
- [x] 关闭原Dialog、保留原文、聚焦原输入框、光标末尾、实际可见灰色帮助文字及aria-describedby；没有第二个输入框/追问界面。
- [x] 多轮追加使用完整query；新请求清空旧有效候选/中心；候选替换不叠加，加载期间旧选项不可点击。
- [x] 新响应先到/旧响应晚到、仅编辑未提交两类过期响应均不能覆盖当前状态。
- [x] 新解析needs_confirmation、not_found、confirmed覆盖；confirmed地址仍需明确点击单候选，不自动锁定中心或附近搜索。
- [x] 明确点击候选后仍由原搜索按钮发起附近搜索；正确保存新文本/中心。
- [x] 帮助文字在候选成功、清空、确认、历史恢复时收起；历史完整中心继续直接回放，不增加确认/解析。
- [x] 桌面/手机键盘Enter、长提示换行、Dialog关闭焦点回归。

## 实际浏览器前后截图

以下均为Chrome实际渲染的正式 `/explore`；before直接运行PR #5的6975b3d，after运行本轮生产构建。三组同尺寸、同夹具查询/中心、火锅、1km、6结果。**截图中的“验收”地点/结果由测试边界提供，不是本轮真实高德返回。生产组件没有内置演示地点。**

| 视口 | 修改前 | 最终版本 |
| --- | --- | --- |
|1440×900|[before](before/explore-desktop.png)|[after](final/explore-desktop.png)|
|820×1180|[before](before/explore-tablet.png)|[after](final/explore-tablet.png)|
|390×844|[before](before/explore-mobile.png)|[after](final/explore-mobile.png)|

UX证据：[手机候选底部入口](ux6/candidates-390.png)、[手机原输入框及辅助说明](ux6/helper-390-1.png)、[桌面辅助说明](ux6/helper-1440-1.png)。这些截图及最终三主视口均已实际打开自检，与PR #9批准图对照；未声称独立视觉评审或产品负责人批准。

布局自检：保留批准稿青绿/弱边界/横栏与同屏列表地图结构；不复制无真实来源的商家缩略图、模拟书签或虚假道路。真实业务评分/价格/营业信息保留，缺失字段沿用原降级显示。共享Shell按Issue要求保留PR #5样式，未追求原型第二套导航的像素复制。

| 宽度 | Shell占宽 | 工作区 | 结果列表 | 地图状态区 |
| --- | ---: | ---: | ---: | ---: |
|768|180|588|241.08|346.92|
|820|180|640|262.39|377.61|
|1024|180|844|346.03|497.97|
|1279|208|1071|439.11|631.89|
|1280|208|1072|439.52|632.48|
|1440|208|1232|500|732|

除500px上限使1440为40.58%外，其余约41/59。实际矩形见 `final/breakpoints.json`。指定六断点无文档横向/纵向溢出、解析/半径/搜索按钮越界，候选/条件Dialog关闭焦点正确。Stage A的1279/1280导航宽度跳变仍作为**非阻断已知设计记录**保留，未实施导航补丁；正式页沿用PR #5的Shell，其该断点没有同一宽度跳变，原1050px宽度规则和手动折叠保持原样。

## 地图真实性与上线前待办

代码证据：`src/server/amap.ts`只读取服务端 `AMAP_WEB_SERVICE_KEY`；没有现成JS SDK、浏览器Key/安全配置或已核实的Preview域名授权。Key实际应用类型、控制台白名单及远端浏览器凭据状态未知；未读取秘密值、修改配置或引入SDK。

本轮按Issue允许的降级路径，使用 `src/components/explore-map-state.tsx` 的**非地理搜索条件示意**：一个实际确认地点的文字/坐标、一个半径文字圈，不含道路/商家点位/地理投影。页面明确“地图尚未接入”“仅示意搜索条件，不表示地理位置或地图比例”。圆形为固定示意尺寸，不按坐标定位，也不声称其尺寸代表真实米数。不是实时高德或可上线的真实地图。

建议独立后续Issue（尚未创建/实施）：**高德JS真实底图与搜索中心/半径圈**。验收应包括：负责人提供并确认适用浏览器Key类型和域名授权（localhost/受保护Preview/生产），核对安全配置与凭据边界，按高德坐标绘制真实中心及米制半径圈、Resize/视野适配、SDK失败/缺配置清楚降级，自动测试与实际Preview截图；禁止商家点位/结果联动。本项是上线前待补能力，本PR不修改密钥/环境配置或部署生产。

## 已执行检查与证据边界

- `npm run lint` PASS，0 warnings；`npm run check` PASS core/web。
- `npm test` PASS103/103；`npm run build` PASS core+Next生产webpack，10路由。构建/Prisma生成仅向子进程传入既有CI localhost占位URL，不连接真实数据库或执行迁移。
- 最终 `npm run test:browser` PASS25/25，50.7s，0 skipped/flaky。14原业务回归+5布局/横栏+6独立UX；使用实际production UI，原历史route/service/repository与搜索validator/service，可控内存DB/合成provider/resolver边界，不依赖外部服务。
- 同一运行时代码在B2全量构建/24例通过后，仅新增测试/证据；最终lint/types/25例再次通过。没有以旧截图或失败运行替代最终结果。
- Diff自检：运行时仅SearchApp呈现/UX、Explore局部CSS、新地图未接入组件；API、AMap、搜索/历史核心、Schema、Shell、Home/History/My Places、package/lock、CI配置均无差异。新增依赖0；新Worktree安装既有锁定依赖，不升级。
- 修复记录：B1首次16/18暴露表单内历史按钮默认submit，修复type=button后全套重跑通过；一次B2测试TS输入类型错误经显式HTMLInputElement修复后重跑。所有失败均未作为通过证据。
- 未验证真实高德/数据库、物理iOS/Android/软键盘、Firefox/WebKit或远端完整真实旅程；这些限制不由截图或构建成功消除。

入口 `/explore`。本地开发：`npm run dev -- --port 3210 --hostname 127.0.0.1`；真实API需要现有服务端配置，不自动写入环境文件。PR提供独立Vercel Preview，保留原保护。stacked目标非master，现有CI规则不会触发，不声称GitHub CI通过；最终master集成链仍须在适用正式PR取得CI/Preview证据。

停止于人工视觉/业务评审，不合并master、不部署生产、不自动关闭Issue #6/#8/#10。
