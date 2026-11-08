# 项目状态与计划

## 类别图标与顶部独立控件已整合（2026-11-08）

- 按用户认可的草图，将五类独立按钮置于真实工作台顶部，取消条件区大外框；精简导航与标题区，扩大左右结果／地图可用空间。
- 五个大类、十个子类、结果标题及地图单点／选中标记共用 SVG 图形定义，KTV／台球／健身使用独立图标；静息 4px、悬停 6px、按下 2px 黑色硬阴影。
- 本机入口 `http://localhost:3130/` 已更新。真实酒店搜索与地图选择、桌面／390px 控件交互完成检查，证据见[整合记录](harness/build/2026-11-08-category-icons.md)。

## 高德地图真实加载验证（2026-11-08）

- 用户已配置地图 JS Key 和安全密钥；本机内测成功加载真实高德地图，验证深圳北站中心、3 公里圈、单类酒店 25 条结果、雷达与聚合／列表选择。
- 已修复 SDK 初始化参数白名单、原生中心图钉容器遮挡点击及名称竖排。隔离测试、类型检查和 Lint 通过；详见[真实地图记录](harness/build/2026-11-08-real-map-validation.md)。
- 审查用新版界面保留于 `/ui-preview/search-map`；本机服务当前为 `http://localhost:3130`。

## 搜索地图界面审查测试版（2026-11-08）

- 根据用户反馈，优先提供独立视觉与交互测试页 `/ui-preview/search-map`。最新样式按用户提供的 FLAREBOARD 截图与完整提示词：米白 24px 网格、240px 白色侧栏、2px 黑描边、4／6／9px 黑色硬阴影、彩色控件配黑字；保留顶部分类与 42:58 搜索／地图双栏。
- 示意底图支持分类、范围、雷达搜索、聚合与列表联动，桌面／390px 浏览器检查通过。用户审查后继续后续接入工作。
- 入口、设计依据及截图见[测试版记录](harness/build/2026-11-08-search-map-design-preview.md)。

## 搜索地图、雷达与密度控制（2026-11-08）

- 按 A 方案接入顶部分类下拉、左侧折叠结果及右侧高德地图；手机共享结果并切换列表／地图。增加全类别点聚合、跨类别 POI 去重、成员分页与列表定位。
- 地图控制器管理 80px 视野缓冲、100ms 批量更新、单画布雷达、有限亮起及资源释放。新增会话保护的地图配置和固定路径代理，安全密钥保留在服务端。
- 本机、Preview 环境文件和本机内测配置均尚未设置地图专用 `AMAP_JS_API_KEY`／`AMAP_JS_SECURITY_CODE`；真实地图接入验收等待配置。实现、隔离验证及证据见[交付记录](harness/build/2026-11-08-search-map.md)。
- 本轮沿用当前工作区并保留已有成果；远端提交、CI、Preview 和生产发布后续安排。

## 双身份内测 Preview 已部署并验收（2026-11-07）

- 预览入口：https://nearby-beta-20261107-jk-d.vercel.app ，固定发布提交 `1f8d494`，Vercel READY；该提交远端 CI 全部通过。
- 线上为 `private-beta`：仅预建账号登录，公开注册与匿名业务访问保持关闭。仅新 Preview 地址放行平台层访问，业务鉴权继续由应用执行；其他部署保护保留。
- 专用 Preview 数据库增量升级到 8 个迁移，迁移前后备份已保存在本机私有目录；原 19 条访客历史、资源和绑定数据保留。线上使用独立密钥与随机强密码，本机账号、密码和 Key 保留。
- 完成 10 组真实线上业务验收及最终提交直接访问复验，覆盖登录、Secure Cookie、Key 管理、A/B 隔离、近期认证、429 恢复、密码重置／停用／退出撤销；高德真实解析、酒店／商场搜索、翻页、回放和取消传播完成验证，上游调用保守上限 8 次。
- 发布、CI、截图、迁移及剩余边界见[Preview 验收记录](harness/build/2026-11-07-private-beta-preview.md)。生产分支与数据库保持原状，后续生产发布单独推进。

## 上线版与测试版登录页改版（2026-11-07）

- 两种内测模式共用居中单列登录页，标题说明与表单分开，420px 表单卡片使用浅边框、透明白色渐变和柔和阴影；移除宣传插画与重复标题。
- 上线使用现有 `private-beta` 配置，保留邮箱密码登录及服务端注册／匿名限制；本机 `local-beta` 保留卡片外匿名入口。已有完整邮箱认证模式继续沿用。
- 新增本机模式浏览器流程并接入 CI，覆盖模式入口、密码显示、同身份刷新、390px／短窗口、匿名转账户及退出清理。当前结果和两种模式的桌面／手机截图见[交付记录](harness/build/2026-11-07-login-page-redesign.md)。

## 当前整合版本：登录、双身份与 Key 管理（2026-11-07）

- 统一入口为 `app/page.tsx → IdentityApp`：读取服务端身份后显示登录／匿名入口，或进入同一搜索工作台。个人中心的新版 Key 管理由账户会话驱动，顶部与侧栏共用该页面。
- 本机采用 `local-beta`，预建账号登录并保留匿名体验；线上内测使用 `private-beta`，关闭公开注册、邮件和匿名；`verified` 继续保留完整邮箱认证。
- 账户使用各自的加密 Key 和云端历史；匿名使用平台 Key、每日 60 次额度与浏览器本地历史。登录结束匿名体验并清理匿名历史，退出与身份切换清理页面和敏感输入。
- 登录安全修正、近期身份验证、新版 Key 概览／编辑／移除、分类流式搜索和历史回放已在同一工作区接通。新增完整身份切换业务回归，整合清单与验证见[整合记录](harness/build/2026-11-07-identity-integration.md)。
- 后续工作：缓存层；远程部署平台与目标库确定后的部署验收；完整邮箱认证公开使用前的真实 SMTP 配置。下方保留各阶段实施记录。

## 个人中心 Key 管理交互（2026-11-07）

- 按确认的设计图完成单一概览卡片、32 位 Key 编辑弹窗、独立移除确认及当前密码验证弹窗；顶部设置入口与侧栏统一进入个人中心。
- 默认仅显示末四位及未配置／待验证／已验证／需要更新状态；取消、退出、会话切换清空敏感输入，同身份刷新保留草稿。搜索工作区缺失／失效 Key 提供个人中心入口，普通页面切换保留搜索内容。
- 身份接口增加 credentialRequiresReauth 展示标志；沿用服务端近期认证和现有 Key 加密、版本、账户隔离及限流规则，无新增数据库结构。
- 验证与桌面／390px 截图见[实施记录](harness/build/2026-11-07-key-management-ui.md)。保留开发者账号和加密 Key，远端交付和缓存层仍按原安排后续推进。

## 登录安全补测与鉴权修正（2026-11-07）

- 补齐三种模式的独立安全断言，统一凭据失败、规范认证路径、校验 Vercel 来源并展示 429 倒计时。登录会话与匿名结束采用同一持久化事务，清理异常或提交前取消回滚。
- 保留现有 PostgreSQL 限流、准入函数和阈值；本轮没有新增治理表、迁移或计数规则。账号级／联合限流及临时状态迁移留给缓存版本。
- 测试、证据、已确认问题与缓存版交接见[登录安全记录](harness/build/2026-11-07-login-security.md)。开发者账号、密码与加密 Key 保留。

## 小范围内测版（2026-11-07）

- 增加 verified／local-beta／private-beta 模式，内测关闭公开注册和邮件功能，线上私有模式拒绝匿名访问，本机保留匿名体验。
- 登录页沿用米白／淡紫风格，提供密码显示切换、错误重试和手机适配；保留 Key 管理、身份切换及搜索历史。
- 管理命令支持创建账号、重置密码、停用；账号以 betaAccess 明确内测资格，disabledAt 停用状态在登录、业务鉴权及最终 SQL 准入中检查。
- 本机持久环境与开发者账号 developer@nearby.test 已准备，原有 Key 加密导入；真实高德调用 0 次。初始化／启动／停止和部署模板见 README。
- 验证及剩余事项见[交付记录](harness/build/2026-11-07-private-beta.md)。实际远程部署、目标库迁移与缓存层留待后续任务。

## 身份交互修正与依赖更新（2026-11-05，本地验收）

- 同身份刷新保留注册／登录／找回密码／重新认证表单和 Key 设置；真实会话变化清理敏感输入，重建搜索与历史。验证／重置回调优先进入对应表单，跨标签页变化立即隐藏旧工作区并重新验证，身份与额度迟到响应按版本丢弃。
- Next／eslint-config-next 升至 16.4.5，Prisma 三件套升至 7.10.1；保留 ESLint 9.39.5、Better Auth 1.7.16。定向更新传递依赖，三份小范围 Lint 补丁由 patch-package 8.0.1 严格应用；完整审计 22 → 0。
- 干净安装、规则兼容、两套临时 PostgreSQL 与旧数据迁移保留检查已通过；完整结果及证据见[实施记录](harness/build/2026-11-05-identity-interaction-dependency-update.md)。
- 下一阶段：真实 SMTP／密钥配置、指定开发库迁移与验收；真实高德及 Vercel 生命周期验收随后安排。本轮沿用工作区并保留已有修改，真实高德调用 0 次。



## 双身份与 BYOK（2026-11-04 开始，2026-11-05 本地验证）

- 完成 Guest／Account 选择、邮箱验证注册、登录退出及密码找回；Better Auth 1.7.16、数据库会话和 SMTP 接入。
- Guest 默认每日 60 次高德准入、北京时间零点重置；本地历史刷新恢复、退出清除。Account 使用每账户唯一的 AES-GCM 加密凭证，云端历史按 userId 隔离。
- 所有解析／搜索／流式／翻页入口接入可信身份，V2 原子准入校验会话与凭证版本，分身份速率和共享租约覆盖完整高德响应；保留 V1 公共配置、预算及数据库恢复能力。
- 本地验证：306 项核心／Route、21 项 AST、35 项原准入 PostgreSQL、21 项身份 PostgreSQL／SMTP、5 项 Chromium，Lint、check/build 和临时库迁移通过。详见[实施与迁移记录](harness/build/2026-11-04-dual-identity-byok.md)。
- 保留当前分支及原有未提交成果。本轮实际高德 0 次；SMTP 使用本地测试服务，迁移仅执行于独立临时库。提交、远端 CI、Preview、生产迁移与部署留待后续授权。
- 上线待办：真实 SMTP、密钥与公共资源配置及真实高德／Vercel 生命周期验收（依赖告警于 2026-11-05 清理，见顶部记录）。账户搜索可用 `NEARBY_ACCOUNT_SEARCH_ENABLED=false` 功能回退。

## 分类结果逐步显示（2026-11-04，本地实现）

- 按已通过的示意图实现独立类别框：默认收起，支持同时展开，逐类更新；保留地点卡、独立排序、分段加载及手动第2页。
- `/api/search` 通过 Accept 协商 NDJSON 进度，普通 JSON 保持兼容；流式请求覆盖解析、搜索、截止、断连和清理。中途更改条件取消旧搜索，断流保留已返回地点。
- 本轮验证与待办见[分类结果记录](harness/build/category-results-2026-11-04/README.md)。真实高德调用0次；当前交付留在本地，线上流式刷新与真实断连验收待安排。


## 数据库异常恢复与最多两类并行（2026-10-29，本地实现）

- 暂时性准备、借连接、读取、断连、SQL 取消、锁等待、死锁和序列化失败保留类别错误，后续类别重新取得预约及许可；缺函数、权限和明确配置错误保留停止策略。
- reserve／grant 已发送事务均使用独立 3000ms 读取排空上限，事务本地空闲上限 5000ms；单次准入 2s、SQL 800ms、锁 150ms、许可及额度／速率策略沿用原值。调用者到期或取消及时返回，后台有界收尾，核验 pg 空闲状态后复用健康连接。
- 默认最多两个类别任务，同次搜索的准入排队，HTTP 可以重叠；内部并发数 1 保留对照。停止令牌撤销未发送准入，已发送 HTTP 可结算；截止快照按类别索引保存。全部类别失败返回 200 partial success 和完整列表。
- 等待抵扣只使用函数结果至 COMMIT 确认的已观测间隔，向下取整减 1ms；资源锁内最终校验继续生效。三轮真实临时 PostgreSQL＋300ms RTT＋2s 模拟 HTTP 对照：串行中位 26361.39ms，并行 14300.63ms，降低 45.75%；全部 60 次模拟类别成功，快响应对照 20 次也全部成功。
- 本轮真实高德调用 0 次，原采样账本维持关闭；本地验证及交付明细见[恢复与并行记录](harness/build/2026-10-29-recovery-parallel.md)。本轮交付为本地补丁，PR、发布及正式端到端验收待另行安排，完整线上问题继续保持待验收状态。

## 预约窗口与提交确认预算分离（2026-10-29，本地修复完成）

- 以独立 loopback PostgreSQL 和只延迟 COMMIT 响应的 TCP 代理复现：预约确认约 700ms 后，800ms 票据只余约 90–100ms，总准入仍余约 1.3s；再延迟确认约 100ms，旧代码产生 ADMISSION_UNAVAILABLE。数据库已完成提交与扣额。
- 正式版默认请求时限与既有请求／批次时序支持 104ms 来自预约窗口的判断；底层云端 COMMIT 确认迟到的具体来源仍待运行时证据。
- 本地修复仅在 grant 分开操作窗口和确认读取预算：借连接／SQL／许可仍受预约限制，读取按总准入余量和原 1200ms 上限等待。明确提交后票据到期归为 ADMISSION_WAIT_EXCEEDED，后续类别继续；补充预约耗时和确认预算诊断。
- 当前工作区通过 271 项核心／Route／实验测试、19 项 AST、32 项真实临时 PostgreSQL 集成，check/build 通过；实验 8 场景前后对照完成，临时库已清理。本轮真实高德调用 0 次，上一轮预算账本保持关闭。
- 修复留在本地，提交／推送／部署另行安排。原 1200ms 上限触发的提交不明继续沿用现有处理；复现、推导、行为及残余问题见[提交确认窗口记录](harness/build/2026-10-29-admission-commit-window.md)。

## 准入诊断已发布与生产采样（2026-10-29）

- PR #31 已合并，Production c5a9869 已 READY，正式域名已核对，PR／master CI 均成功。准确提交验证 230 核心／Route + 19 AST、31 PostgreSQL、check/build 通过。
- 已完成有界采样并关闭账本：预扣 28/32，确认成功高德调用 25 次；Preview 十类全成功，Production 十类九类成功、火锅等待到期后继续。
- 捕获生产 grant／commit 驱动读取超时：函数约 10.90ms 返回，COMMIT 约 105.65ms 时超时，实际预算 104ms、提交确认未知。诊断已生效；底层提交延迟来源及预算收缩来源继续核对，实际修复另行制定。
- 闲置／紧接两轮均成功，保留原策略及参数。完整逐类别结果、版本、预算和下一轮建议见[采样报告](harness/build/2026-10-29-admission-production-sampling.md)。本次采样报告及本段为发布后的本地证据补充。


## 准入事务诊断补充（2026-10-29，本地完成）

- 本轮只读核对确认 PR #29／#30 已合并，正式部署为 master `5b0456e`，Vercel 状态 READY。下方各次交付记录继续保留发生时状态。
- 正式站 13:01:02 与 12:56:40 的搜索均在 reserve／commit 确认阶段失败，批次约 1201ms、借连接约 0.1–0.2ms、SQLSTATE 为 null；具体提交延迟来源继续调查。
- 本地补充逐语句客户端计时、实际读取上限、固定错误分类、四态提交确认、连接销毁请求及 attemptId／operation 关联；BEGIN 标签独立。沿用原有超时、流水发送、错误响应和搜索策略。
- 本轮验证：270 项核心／Route／实验测试、19 项 AST、独立 loopback PostgreSQL 18 集成 31 项，check/build 通过；真实高德调用 0 次，临时库已清理。
- 当前补丁留在本地工作区，提交／推送／部署另行安排。下一步交付后，用同一请求的新增失败日志定位各条结果返回时间及提交确认间隔。字段含义及证据见[事务诊断记录](harness/build/2026-10-29-admission-transaction-diagnostics.md)。

## 时间治理 Stage A 与失败调度 Stage B（2026-10-29，本地完成）

- 已完成覆盖 A／B 的只读影响面核验，随后连续实施；沿用当前工作区、串行搜索、已有短事务和预热成果。
- 请求上下文统一父子剩余预算、同步截止检查、超时原因、取消传播及等待；数据库准备和连接获取也复用该机制。产品搜索删除固定 500ms 等待，保留总期限 60s、准入 2s、HTTP 8s 及数据库保护。
- 删除类别等待后，真实临时 PostgreSQL 测试揭示预约队列与实际放行屏障错位。新增 `20261029000000_amap_admission_slot_alignment` 迁移，预约取当前时间、预约队列和实际放行屏障的最大值；旧迁移保持原样，既有计数、绑定、策略和最终复核沿用。
- 错误分类提供性质与范围，搜索调度器决定停止或继续；准入等待失败可继续，额度／认证／数据库故障停止共享链路；整体截止保留已完成结果，主动取消沿用 499。高德明确日额度错误也停止后续调用。
- 本轮最终验证：264 项核心／Route／实验测试、19 项 AST、独立 PostgreSQL 18.4 集成测试 31 项通过；check/build 通过。约 300ms TCP RTT 下十类别全部完成；单次准入两批约 634ms。真实高德调用 0 次。
- 当前交付为本地改动，尚未提交、推送、迁移 Preview／生产或部署；下一步在后续授权下按“函数迁移 → 应用交付 → CI／Preview／真实链路验收”执行。完整责任表、失败策略及验证见 [交付记录](harness/build/2026-10-29-time-and-failure-governance.md)。

## 地点解析与准入链路调查（2026-10-29）

- 已还原原解析、准入、预热、短事务及诊断版本；确认 Preview 两个函数缺失，并按已有授权迁移。迁移前后原资源及绑定保持原样。
- 以实际 Vercel Preview＋Preview 数据库＋真实高德验证：深圳北站解析返回 10 个候选，十类别真实搜索全部成功、约 20.7s；合计 11 次真实调用，搜索资源月计数增加 11 次。保留请求 ID、周期变化及数据库放行时间序列。
- 补充 Preview 独立资源回归、原计划 9 场景及时间窗口实验；测试资源已清理。Stage A 时间机制与 Stage B 调度改造按调查证据细化，当前业务源码沿用原状态。
- 调查、版本／环境区分、重现方法、剩余验收见[调查文件](harness/build/2026-10-29-admission-chain-investigation.md)。下方内容保留各次交付发生时状态。


## 准入短事务与两批次链路（2026-10-28，本地交付）

- 按本轮确认方案新增两个调用者权限 PostgreSQL 函数，预约与放行各由一个短事务执行；准入专用 pg 池流水发送 BEGIN、限时设置、函数调用、COMMIT，提交确认后才返回许可。原有表、计数、绑定、策略触发器和类别串行／500ms 间隔沿用。
- 初版保留总准入 2 秒、SQL 800ms、锁 150ms、驱动 1200ms、获取连接 600ms；原有资源放行间隔、宽限、许可 TTL 与额度未调整。等待期间释放连接；取消后的批次排空、迟到连接回收及提交不确定时停止高德发送已覆盖。
- 当前代码本地验证：251 项核心／Route／实验／准入测试 + 19 项 AST，独立 PostgreSQL 18.4 集成测试 30 项，均通过；check/build 通过。真实 TCP 代理对请求／响应各增加 150ms 延迟，单次准入两批约 323.97/310.16ms，总约 650ms，模拟 HTTP 1 次、扣额 1 次。十类别及超 400ms 许可失效场景也通过。
- CI 已配置 PostgreSQL 17 服务及独立准入集成步骤；远端 CI 待本轮代码交付后执行。新增函数迁移仅应用于 loopback 临时测试库，开发／生产数据库保持原状，高德真实调用 0 次。本轮未提交、推送、迁移线上数据库或部署。
- 完整实现、测试与后续迁移／Preview 顺序见 [交付记录](harness/build/2026-10-28-admission-functions.md)。原预热 PR #28 已于本日合并为 5e94d44；下方记录保留发生时语境。下一步为审查本地改动，再按后续授权进行函数迁移与应用交付。


2026-10-28 已按用户授权将两轮 POI 联合查询真实证据发布为 [Issue #27](https://github.com/JKd121/nearby-places/issues/27)：包含三个地点的逐类别表、排序耗时、分类限制及15次请求脱敏聚合。本地发布文档为 `harness/build/2026-10-28-poi-union-github-evidence.md`；此次仅创建 Issue，没有提交/推送工作区代码或新增高德调用。

## distance / weight 六次小对照（2026-10-28）

- 用户批准比较两种排序，沿用当前本地探索分支及私有三地点、全部 10 类；每地点各执行 distance/weight 一次，共 6 次，交替顺序，其余参数一致。
- 独立入口 `experiment:poi-union:sort` 与固定新回合预算，保留原 V1 已用完的 9 次锁/日志/报告。沿用本地模式，跳过 PostgreSQL；无重试、翻页、并发或生产策略修改。结果记录于本轮排序对照报告。
- 已完成6/6真实请求，全部成功；明确覆盖distance→weight为3→6、5→5、5→6类，平均响应200.03→226.78ms，显示改善随地点变化。268项测试、check/build/diff检查通过，原轮预算及无关工作文件核验保留。详见[配对证据](harness/build/2026-10-28-poi-union-sort-comparison.md)；两轮累计高德15次，本轮停止。

## 多类别真实数据探索优先（2026-10-28）

- 用户明确暂停数据库超时追查，授权新分支 `Nearby-多类别真实数据探索-V1`，本地实验跳过 PostgreSQL 准入，普通请求错误记录后继续，优先获取返回质量及耗时。既有预热/诊断和其他未提交内容原样保留，无额外 Worktree。
- 新入口为 `npm run experiment:poi-union:local`，默认 Dry；Live 使用单独显式授权参数，接管原尚未使用的 9 次预算，复用统一高德传输、原三地点/分类计划与聚合报告。操作说明见 [本地探索](scripts/experiments/poi-union/LOCAL-EXPLORATION.md)。
- 本轮验证与采集结果记录于 [探索证据](harness/build/2026-10-28-poi-union-local-exploration.md)；生产搜索入口保持现状，本轮仅本地操作。
- 已完成真实采集 9/9，全部 HTTP 200、status=1；3/5/10 类平均响应 214.89/189.40/170.64ms。8 项第一页触顶，site-1 扩为 10 类后出现此前已返回类别的缺失，未确认编码单列。结果及计时解释见探索证据与脱敏聚合报告；本轮预算已用完，停止继续调用。

## 准入数据库预热与实例生命周期（2026-10-28，本地实现）

- 用户要求保留预热连接、单实例协调及调整预热入口；已选择只覆盖高德准入池，普通历史池保持现有配置。线上环境按 Vercel 理解。
- 本地修改包括 Next Node 启动预热、CLI 预算锁前预热、请求入口共享准备任务。本地保留一条空闲连接；Vercel 接入官方池生命周期辅助并在恢复后重查。准备阶段独立于现有 2 秒准入和高德 HTTP 计时；Web 端到端截止与取消继续生效。
- 目标数据库端点拒绝携带旧会话超时参数的连接，已取得简化启动参数的成功对照；SQL/锁/空闲事务限时继续由现有准入事务设置。额度、QPS、资源绑定、Schema 和生产搜索调度保持原值。
- 最终 223 项核心/Route 测试及 19 项 AST 测试、check/build 通过。真实只读验证：首次预热 2092.23 ms，共享等待 0.06 ms，空闲 11 秒后检查 375.43 ms，物理连接保持 1 条；高德调用和额度写入均为 0。见 [实现记录](harness/build/2026-10-28-admission-database-warmup.md)。
- 同日用户授权“测试通过后真实采集”：重新执行 242 项测试、check/build 均通过；预热 2186.27 ms、绑定/额度读取成功，只读事务 1116.90 ms 成功。随后仅启动一次 Live，在 site-1/A 完整准入阶段约 1466 ms 返回 `ADMISSION_UNAVAILABLE`，高德 HTTP 0 次、后续 8 项停止。预算锁保留，未补跑；下一步是准入内部阶段诊断。只读检查通过与完整准入失败分别记录，实际失败阶段尚待细分。
- 按用户“小步实施”授权，已完成失败路径脱敏诊断：每个失败的准入事务输出 `admission.failed`，记录 reserve/grant、最后执行标签、Prisma/SQLSTATE、耗时和当前预算。SQL、参数、限时及错误映射沿用原逻辑；新增 7 项隔离测试，最终 230 项核心/Route + 19 项 AST、check/build 通过。此步未连接真实数据库或重跑 Live，原 1.47 秒失败的具体原因待受控复现。详见实现记录的同日诊断补充。
- 随后按用户授权仅复现一次数据库准入：预热 2349.22 ms 成功，准入约 1524.90 ms 失败。日志定位为 `phase=reserve`、`step=clock.select`、`prismaCode=P2028`，事务调用 1522.96 ms、最近阶段 300.97 ms、事务预算 800 ms。资源和绑定检查已通过，预约写入及 grant 未执行，高德 0 次。当前重点为交互式事务预算与多轮往返，P2028 的具体子原因尚未采集；本轮未调整参数或再次复现。
- 保留其他任务的未提交内容，本轮不提交、推送、更新 PR 或部署。下一步为审查和另行授权的 Preview 生命周期验收。

## POI 2.0 多类别联合查询隔离实验 V1（2026-10-28）

- 本轮授权已扩展为整理实验专用分支、提交并创建面向 master 的独立 Draft PR。Stage C PR #25 已合并，基线为 `31adccd`；沿用当前 checkout，保留其他任务的未提交修改，不新增 Worktree，不合并或部署。
- 实验入口 `scripts/experiments/poi-union/`；默认 Dry，Mock 采用假响应，Live 需要单独授权参数、私有三地点配置、既有 PostgreSQL 准入及固定的一次性 9 次预算锁。生产搜索调度、解析、API、UI、额度与 QPS 均未改。
- 当前实现与验证记录见 [交付证据](harness/build/2026-10-28-poi-union-v1.md)，操作说明见 [实验 README](scripts/experiments/poi-union/README.md)。报告只保留明确 typecode 归属和安全聚合，父子编码映射不足处保持未确认。
- 下一步为独立源码与安全审查；真实采集、后续分析与生产策略设计均未授权，PR 创建后停止。下方 Stage C 等记录保留其历史语境，不扩大本轮范围。

## Stage C 本地工作（2026-10-28）

- 当前授权为搜索异常分类及传播治理；不修改准入调度、额度/QPS、数据库结构或串行策略，不自动重试，也不授权合并或生产部署。当前工作分支 HEAD `fc1cc26` 与生产合并提交 `4e0cbaf` 的功能树需按实际 diff 核对；保留已有未提交文档和测试改动。
- 本地实现集中分类：可恢复类别失败继续；准入/额度/认证停止后如有已完成类别，返回部分结果并标记未执行类别；无已完成类别时保留公开 HTTP 错误；取消、整体截止和未知异常向上传播。前端区分失败和未搜索，历史仅在有完成类别时保存。
- 本阶段仅针对错误传播，不承诺修复 429/503 的底层原因或改善搜索耗时；生产仍需诊断。生产故障证据见 `harness/build/2026-10-27-amap-admission-incident.md`。最新验证、待复核风险和版本以本次交付为准。

## 当前状态（2026-10-27 核对）

### 分支命名整理（2026-10-27）

- 用户要求分支统一以 `Nearby-` 开头，后接任务目的，可保留已有版本或阶段，并已明确选择保留 `master`。已使用 GitHub 官方 rename 接口完成全部 11 条开发分支改名，名称映射见 [build-log](harness/build-log.md) 当日分支整理条目；没有通过创建/删除分支来替代重命名。
- 当前工作分支 `Nearby-高德请求安全与额度准入`，HEAD `fc1cc268749191409d0ddd64045fc9957c7dd821`，跟踪同名远端；本地 UI 分支为 `Nearby-统一搜索工作台`。性能 Worktree 为 `Nearby-周边搜索性能优化`，HEAD `0ec6ebe`，跟踪 `origin/Nearby-搜索性能诊断-v1` 且仍领先两个提交；没有改其代码或合并提交。
- 用户明确批准改名后重建草稿：原 Draft PR #15 / #16 已由 GitHub 在源分支重命名时关闭，分别由 [PR #22：性能诊断](https://github.com/JKd121/nearby-places/pull/22) / [PR #23：性能调研](https://github.com/JKd121/nearby-places/pull/23) 接续。两份新 PR 均为 open Draft，保留原标题、完整原描述、源提交和 master 目标，并链接原讨论。#22 与当前 master 存在代码冲突，本轮未处理，也没有合并。CI 的 master 触发条件和 Vercel 配置未改。
- 核验完成：远端仍为 12 条分支，11 条开发分支均以 Nearby 开头、SHA 全部不变，master 及 origin/HEAD 保持原指向。两个 Worktree 的 HEAD、暂存/未暂存差异和原有未跟踪内容在两轮记录更新前均与各自入场哈希一致。随后仅同步本节、命名规则和整理记录，不提交或推送文件，不重跑业务测试。
- 下方业务阶段记录保留；其中原分支名称及 `b849deb` / `40ef098` 版本对应较早文档核对时点，不作为分支整理后的实时引用。其他任务的历史授权不由本轮改名重新启用。

### 当前授权：最小 Stage B + B-Q 闭环

- 用户在本聊天明确要求开工：用 PostgreSQL 原子预约、事务外等待、最终预算／速率联合准入，统一接入现有高德出口；最小闭环验收后转渐进式类别搜索。本次不做 UI、百人压测、队列 Worker、自动退款或 Key 轮换。
- 当前在原分支实施，保留此前文档未提交成果；新增迁移文件只在独立 loopback 测试库执行，不连接现有开发／生产数据库，不真实调用高德，不提交／推送／部署。
- 最小模型为一张资源协调表与一张操作绑定表；服务端 Key 不入库，日预算需显式配置，真实资源共享关系仍待上线前核实。无绑定、未启用或数据库失败一律拒绝，不隐式绕过。
- 本地验证通过：180/180 隔离测试、13/13 真实临时 PostgreSQL 集成测试（含独立进程、三个真实 Route、提交不确定）、check/build、空测试库三份迁移部署及 diff 检查。细节见 `harness/build/2026-10-27-amap-admission.md`；尚未迁移或配置生产，渐进式 UI 尚未开始。

项目已具备统一搜索工作台、10 类周边搜索、单类别高德第 2 页、原始营业时间显示，以及 Prisma / PostgreSQL 访客历史保存、删除和直接回放。个人中心仍为静态展示，设置为无操作占位；完整功能、运行方式与代码地图见 [README.md](README.md)，测试说明见 [test/README.md](test/README.md)。

### 版本与交付证据

- 本地工作分支仍为 `高德请求安全基线`，HEAD `b849debacc874de2e7c77a751e805b58f7243968`。2026-10-27 通过 GitHub 只读接口核对远端 `master` 为 `40ef098ca438b2103d3bdaa6f5c5e2ed433173d4`；比较结果仅多一个合并提交、文件差异为 0，二者 tree 同为 `5fde92b53601a22185c68ae9dae65c34c6c020e2`。本轮未切换分支或更新本地远端缓存。
- [PR #19：统一地点搜索工作台与反馈组件](https://github.com/JKd121/nearby-places/pull/19) 与 [PR #20：Stage A 高德请求链路安全基线](https://github.com/JKd121/nearby-places/pull/20) 已合并，状态为本次实时核对。此前报告中的“未发布”“仅本地提交”“等待 Preview 授权”是当时的阶段快照。
- 历史交付记录报告过 Stage A Production 部署及非破坏性冒烟通过；本轮没有重新检查 Vercel、线上数据库或真实高德，不把 PR 已合并当作当前生产部署健康证明。
- 当前目录原有 `AGENTS.md`、`PLANS.md` 未提交修改及两份未跟踪独立评审包保留；本轮文档更新仍为本地差异。性能 Worktree `周边搜索性能优化` 不处理，其诊断/并发研究不能当作本分支已交付能力。

### 现有安全基线与待验证项

| 项目 | 当前实现及边界 |
| --- | --- |
| 高德出口 | `src/amap/transport.ts` 统一传输；无自动重试；生产代码经 AST 出口门禁检查 |
| 搜索调度 | 类别串行，相邻类别等待 500 ms；普通失败保留其他类别结果，全部失败报错；请求终止异常停止后续工作 |
| 候选参数 | `src/amap/policy.ts`：单次 8 秒、业务总时限 60 秒、上游响应 1 MiB、三个高德 Route 入站 JSON 64 KiB；实际生效但尚未冻结为正式生产参数 |
| 显式覆盖 | `AMAP_UPSTREAM_TIMEOUT_MS`、`AMAP_REQUEST_TIMEOUT_MS`、`AMAP_MAX_RESPONSE_BYTES`、`AMAP_HOST_MAX_DURATION_MS` 四项必须一起提供且通过校验；入站 64 KiB 不通过环境变量覆盖。默认无需设置这些变量 |
| 宿主时限 | 代码中的 300 秒来自此前人工确认；应用 60 秒不等于平台时限。本轮未查询平台当前配置 |
| 取消支持 | `vercel.json` 对 resolve-location、search、search/page 三个源 Route 声明 `supportsCancellation: true`，不覆盖 history。真实客户端断连后的完整取消传播和资源清理仍缺端到端验收 |
| 限读边界 | 64 KiB 限制应用接收/累计的 JSON 字节，不等于底层网络或运行时的内存峰值上限；history 未纳入该限制 |
| 本地实现、待启用 | PostgreSQL 预算／共享速率准入及迁移；真实数据库迁移、资源绑定、政策配置和部署未执行；WAF 尚未实现 |

后续请求安全 Stage B / B-Q / C / D 与搜索性能研究各自沿用对应任务边界，不能因本轮文档维护自动进入实施。POI 照片、公交线路与时刻表、Provider 第 3 页及以后、收藏、账号、地图等也不因历史计划存在而获得实施授权。

### 本轮工作：文档与实际项目同步

- 用户要求结合当前项目更新 README、PLANS、AGENTS 及相关说明；范围为文档和环境变量示例，保留现有未提交成果，不改业务代码、依赖、测试行为、数据库或部署配置。
- 更新 README 的产品形态、10 类搜索、历史、运行环境、环境加载、Prisma 配置和命令；新增 `test/README.md` 解释现有测试分层，补齐 `.env.example` 的数据库变量；相关历史报告添加日期说明，原始验收正文保留。
- 验证完成：本轮 170 项隔离测试、check、build、显式 Prisma 客户端生成及文档链接/命令检查通过，详见 [harness/build-log.md](harness/build-log.md) 的 2026-10-27 条目。历史结果仅用于追溯；本轮未执行真实 API smoke、数据库迁移或浏览器端到端验收。
- 下一步：审阅本地文档差异；Git 提交、推送、PR、合并及部署须按后续明确授权执行。

## 历史快照（以下内容不作为当前任务或新授权）

下列正文保留各次任务当时的决定、限制和证据。当前功能与状态以上方核对为准；其中全局 Codex 配置、机器绝对路径和备份仅属于当时维护记录，不是其他开发者的安装步骤。

## 环境维护历史快照：原生 Codex 环境精简（2026-10-25）

- 授权：本聊天用户明确选择“现在执行：备份、停用旧流程、精简规则”。范围为全局 AGENTS、技能停用配置、本项目 AGENTS / PLANS及可恢复备份；保留专业工具、业务代码和已有未提交成果，不改变权限，不删除插件缓存。
- 结果：精简全局原则，移除项目对 Team Workflow 的强制引用；以逐技能配置停用旧流程控制入口。原生 Plan / Goal 按任务需要使用，不新建流程 Skill 或管理系统。
- 备份：`C:/Users/lenovo/.codex/backups/native-baseline-20261025-111624/` 保存四份修订前文件、哈希、停用清单和验证记录。备份包含本项目此前未提交的资料修订；不以 HEAD 覆盖恢复。
- 验证边界：本轮检查 TOML 解析、非技能配置不变、目标技能路径及停用项、专业能力源文件保留、文档与 Git 差异；不运行 npm 测试或构建，不调用真实高德或数据库，不提交或同步主线。
- 本地验证结果：76项技能目标均有停用配置（新增65项，11项原已停用），原有27条配置保留；20项配置/文件检查及 `git diff --check` 通过，已安装 CLI 的 `codex features list` 读取配置退出码为0。清单与检查结果在备份目录；CLI读取通过不代表桌面端重启后的技能加载已验收。
- 生效限制：需重启 Codex 并在新会话核对技能目录及工具可用性；当前长会话已加载的旧指令不会自动消失。插件保留启用，其声明的会话钩子未改动，不能宣称所有旧上下文注入已退出；钩子的实际执行与影响仍待单独验证。
- 项目状态沿用下方核对记录：当前分支 `高德请求安全基线`，HEAD `b849debacc874de2e7c77a751e805b58f7243968`；未切换、拉取、提交或推送。两个未跟踪审查包不处理；此前远端指针及部署报告不视为本轮实时复核。
- 有效业务边界：保留下方请求安全基线、参数及残余风险；本轮不开发 Stage B / B-Q / C / D，不改性能 Worktree。历史记录只提供事实与证据，不恢复已过期的操作授权。
- 下一步：重启后的新会话做一次轻量验收：简单问答、只读定向搜索、确认不再强制调用旧流程，检查必要工具仍可用。代码修复或外部交付仍按后续具体任务授权执行。

以下为此前资料修订及业务阶段的历史快照；其中状态和下一步不作为本轮待执行指令。

## 资料修订历史快照（2026-10-25，非当前任务状态）

- 状态：资料修订交付，等待人工复核。本次仅修订项目 `AGENTS.md` 和本文件，不开展功能开发。
- 授权来源：本聊天用户批准此前资料修订方案，限定上述两个文件；禁止修改其他文件、切换分支、拉取、合并、推送或提交，不处理两个未跟踪审查包。Full Access 不扩大授权。
- 技术依据：`package.json`、`app/`、`src/`、`prisma/schema.prisma`、`test/` 和 `.github/workflows/ci.yml`。项目为 Next.js / React / TypeScript 全栈 Web 应用，Prisma 使用 PostgreSQL；CLI Spike 是早期阶段，不能继续代表当前项目形态。
- 本地工作状态（本次只读核对）：工作分支 `高德请求安全基线`，HEAD `b849debacc874de2e7c77a751e805b58f7243968`；修订前已跟踪文件无差异。已有两个未跟踪文件 `harness/build/2026-10-25-stage-a-independent-review.md`、`harness/build/2026-10-25-stage-a-independent-review-v2.md` 保留。本次修改尚未提交，不属于下列远端版本。
- 主线状态分别记录：本地 master 为 `3bc08d4f7636b72c7206f1d9e4cb6272c212e41b`；本地缓存 origin/master 为 `df84cf2f6f788596a6e5e2de418b6ad38d515313`；`git ls-remote origin refs/heads/master` 本次返回远端 `40ef098ca438b2103d3bdaa6f5c5e2ed433173d4`。未拉取，且该远端提交对象本地不可用，不能用缓存推断最新远端内容或完整祖先关系。
- 交付记录与部署状态：本聊天此前交付记录报告 [PR #20](https://github.com/JKd121/nearby-places/pull/20) 已合并，合并提交为 `40ef098ca438b2103d3bdaa6f5c5e2ed433173d4`，并报告 Production 自动部署及非破坏性冒烟通过。本轮仅复核远端分支指针，未重新核查 PR、CI 或 Vercel；当前部署状态及提交对应关系标记为待确认，不能由远端指针或本地构建推断。
- 历史验证依据：`harness/build/request-safety-stage-a-local-delivery.json`、`harness/build/2026-10-25-stage-a-inbound-body-limit.md` 等保存 Stage A v2 的 test/check/build 结果；本次不重跑、不将历史结果描述为本轮验证。其他报告中保留的“仅本地提交”“尚未授权 Preview”等描述属于当时快照，不作为当前授权或最新交付结论。
- 仍有效的安全边界：保留现有 UI、历史回放、搜索策略、排序、类别串行调度与 500ms 间隔；不自动重试、不暴露密钥、完整高德 URL 或原始上游正文。Stage B / B-Q / C / D、数据库预算、WAF 和性能并发改造未获本轮授权；性能 Worktree 不处理。
- 残余风险：`vercel.json` 已在本地为三个高德 Route 显式配置 `supportsCancellation: true`，未覆盖 history；配置存在不等于最终平台配置或断连行为已验证。真实客户端断连后的完整取消传播与资源清理尚未端到端验证；用户此前已接受该风险用于 Stage A 交付，本次不宣称风险已消除。
- 参数：8 秒单次调用、60 秒业务总时限、1 MiB 上游响应、64 KiB 入站 JSON 是现有实现的候选默认值，不因本次文档修订而冻结为正式生产参数。60 秒是应用时限；64 KiB 不是底层网络内存峰值上限。宿主 300 秒为此前人工确认记录，本轮未查询平台。
- 本轮验证范围：检查 Git diff 仅涉及两个授权文件、Markdown 结构及新增本地引用存在性，确认归档正文保留；不运行会生成文件的 npm test/check/build，不调用真实高德或数据库。
- 下一步：人工复核这两个文件的差异；提交、同步主线、部署或其他优化需新的明确授权。

## Stage A 历史快照：本地 Git 交付阶段（2026-10-25，非当前任务状态）

以下内容保留当时的决定、约束和证据；其中阶段状态、授权及下一步已由上方现状说明取代，不应恢复为待执行指令。有效安全约束仍保留。

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

## UI 历史快照：工作台改版（2026-10-24，非当前任务状态）

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
