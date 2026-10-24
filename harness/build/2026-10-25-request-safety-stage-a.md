# 高德请求安全基线 — Stage A

最新状态：用户确认Stage A v2（含64KiB补丁）独立代码审查通过，无新增P1/P2阻止Preview，授权仅在当前分支本地提交。受审代码哈希在提交前再次核对，重新执行npm test/check/build，记录见 `request-safety-stage-a-local-delivery.json`。不推送、创建PR或部署；等待后续Preview授权。补丁记录见 `2026-10-25-stage-a-inbound-body-limit.md`，机器证据见 `request-safety-stage-a-inbound-evidence.json`。下方156项为历史验证记录，不代表当前补丁版本的新增验收。

## 授权与基线

用户批准本地 Stage A 实现、隔离测试、check/build，明确禁止数据库预算、迁移、WAF、性能并发、真实 API smoke、Issue/PR、生产部署。完成后等待独立审查和 Preview 验收。本轮没有自动创建提交或推送。

入场工作区干净。fetch 后确认远端主线 `df84cf2` 是 UI PR #19 的合并提交，父提交包含 `94bbd61`。在同一目录从此提交建立 `高德请求安全基线`，取消其自动生成的 origin/master 跟踪以避免误推主线。旧 UI 分支和性能 b368 Worktree 保留；本地 master 没有被移动。

用户人工确认 Fluid Compute Enabled、项目默认 Function Max Duration 300s、无函数级覆盖。未修改平台或环境配置。`src/amap/policy.ts`集中定义8s单次、60s总计、1MiB实际字节和已确认的300s宿主边界，仍属本轮候选，不能据此视为生产参数已冻结。可选显式环境覆盖必须完整且通过正整数、时限层级及宿主余量校验；本轮没有设置真实覆盖。

## 文件差异与职责

| 文件 | 变化 |
| --- | --- |
| src/amap/transport.ts | 唯一高德 fetch；限制host/path、禁止重定向和缓存、无重试；fetch到body读取共用单次时限；分块读取累计字节；安全校验/异常；beforeAttempt为未来预算的唯一接入口契约，无预算实现 |
| src/amap/errors.ts | 明确取消、上游超时、总时限、认证、网络/HTTP/响应格式、大小、全类别失败；固定日志字段，不记录原始cause/info/body/URL |
| src/amap/request-context.ts | 请求独立controller、首次原因保留、子调用、可取消等待、清理；不合作的模拟操作也有界返回 |
| src/amap/policy.ts、src/server/request-policy.ts | 集中候选参数、验证可选覆盖及宿主余量 |
| src/server/request-lifecycle.ts | Route入口即建立总时限，覆盖body解析/类别等待/上游fetch/read；主动取消入站body reader并在所有出口清理 |
| src/amap/client.ts、src/location/provider.ts | 去除独立fetch/text/JSON校验，实现真实出口收敛；保留fetchImpl入口但只能装配公共传输；空地理编码通过错误code识别 |
| src/server/amap.ts | 两个服务端工厂强制装配公共传输，诊断接口可注入，无旁路开关 |
| src/location/resolver.ts、src/location/types.ts | 传递上下文，保留解析与归一化算法和诊断阶段 |
| src/search/service.ts | 请求终止异常重抛；普通类别安全失败继续；可取消500ms等待；全失败抛错，空结果仍成功 |
| src/server/http.ts、src/location/http.ts | 统一安全映射；取消499、两种超时504、认证503、一般上游和全部失败502；缺Key维持500；未来共享预算503已在计划确认但本轮不实现 |
| app/api/search/route.ts、app/api/search/page/route.ts、app/api/resolve-location/route.ts | 生命周期、上下文、服务端工厂与安全错误接通；取消/总超时不误报JSON400 |
| src/web/SearchApp.tsx | 三条fetch均带signal；失效时取消并保留requestId；主动取消静默；卸载cleanup；完成时清理活动controller；不改JSX布局、排序或历史实现 |
| src/diagnostics.ts | 复用性能分支的轻量注入契约并补充取消/响应过大分类，无日志服务器/新框架；保留fetch/read/json/validate/transform、类别和等待的测量边界 |
| scripts/check-amap-boundary.mjs | TypeScript AST检查整个src/app、新增生产文件；禁止传输外fetch、别名/反射常见旁路、直接底层工厂、网络模块、新未审核外部模块、CLI/test生产导入、浏览器高德端点 |
| test/transport.test.ts、test/request-lifecycle.test.ts、test/request-safety-route.test.ts、test/amap-boundary.test.mjs | 单元、Route、正反例架构检查与loopback模拟HTTP；不调用高德或数据库 |
| test/request-safety-browser.mjs | 在实际生产构建页面执行的隔离自动化场景；所有API由预导航dispatcher/in-page mock替代 |
| test/request-safety-unmount-server.mjs | 仅测试用挂载页，以现有webpack/TypeScript/React打包真实SearchApp，生成文件位于OS临时目录；验证真实组件卸载，不新增产品Route或依赖 |
| test/search-service.test.ts、test/smoke.test.ts | 更新共享类别循环的安全错误预期；smoke.test是mock单元测试，不是实际smoke命令 |
| package.json | 新增check:boundary并纳入npm test；显式加入新增测试文件，不新增依赖 |

## 语义与安全边界

- 单次8s在实际HTTP前启动，持续到body读取完成；请求60s在Route入口启动，包括入站body解析。两个code独立，首个终止原因不被覆盖。
- 第一版任一上游超时即保守终止整个请求。策略位于业务编排；context可以广播给未来兄弟任务，本轮仍严格串行。
- 类别普通失败返回固定安全消息，info/infocode置null；内部日志保留操作、标准分类、上游HTTP状态及仅数字的错误码。高德认证分类依据官方错误码：https://lbs.amap.com/api/webservice/guide/tools/info 。不按自由文本猜测。
- 成功空结果和受既有过滤规则影响的完整raw页语义不变；部分失败仍200 partial success，全失败502。
- 未来beforeAttempt必须在真实HTTP尝试前完成；本阶段仅定义和测试调用顺序、拒绝/取消不触发fetch，没有数据库调用或额度计算。
- 网络出口结构检查是保守架构门禁，覆盖常见直接/别名旁路与新增模块；不是任意JavaScript代码或依赖内部行为的安全沙箱。新增依赖/网络模块仍需代码审查。

## 验证执行记录（入站补丁前的历史）

最终机器结果见 `request-safety-stage-a-evidence.json`、命令耗时见 `request-safety-stage-a-commands.json`，记录已验证源文件SHA256。以下均为实际执行结果。

- npm test：156/156 PASS（Node业务/安全139，AST架构正反例17），命令总耗时6127ms。包含原有测试、隔离Route、安全回归及真实loopback HTTP，不使用生产Key或数据库。耗时仅作为本地运行记录，不作为性能基准。
- npm run check：PASS，4254ms；npm run build：PASS，14987ms。路由范围与原UI版本一致，没有新增生产路由。
- 8s/60s精确边界用Node mock时钟测试，属于虚拟时间，不声称实际等待8/60秒。
- 1MiB边界使用实际字节数据，验证刚好允许、额外1字节拒绝、分块/多字节/虚假或缺失Content-Length。
- 本地模拟HTTP读取超时100ms：最终批次返回及连接关闭耗时见机器证据（约100ms量级）；禁止跟随重定向，两个场景共2次请求，无重试，不作为性能SLA。
- 生产构建页面浏览器14项断言PASS，476ms；真实SearchApp挂载fixture20项断言PASS，1035ms，包含解析/搜索/第二页挂起后的React unmount及迟到响应。两页console warn/error为空，无未处理Promise拒绝。记录见 `request-safety-stage-a-browser.json`、`request-safety-stage-a-unmount.json`。浏览器测试覆盖最终SearchApp源版本；最后服务端统一错误出口的修订已重新通过Route测试、check/build，前端源没有再改。
- 早期fixture失败原因是history store在mount时捕获fetch，后来替换window.fetch不能接管它；改为加载应用前安装dispatcher后通过。早期尝试没有作为有效浏览器证据。
- git diff --check、两个浏览器fixture脚本的node --check PASS；数据库、历史服务、类别配置、排序/归一化/意图路由、依赖锁文件无差异。性能Worktree仍干净，HEAD仍为0ec6ebe。

## 浏览器复现方式

在本地生产构建页面，导航前注入以下脚本（防止任何API触及真实环境）：

```js
const baseFetch = window.fetch;
window.fetch = (...args) => window.__stageAFetch
  ? window.__stageAFetch(...args)
  : String(args[0]).startsWith('/api/')
    ? Promise.resolve(Response.json({items:[]}))
    : baseFetch(...args);
```

再在浏览器执行 `test/request-safety-browser.mjs` 导出的 `runRequestSafetyBrowser` 函数。它验证取消、忽略不合作旧响应、不保存旧历史、错误重试、正常结果、第二页失败保留结果、第二页取消和历史回放。原始结果仅含合成请求路径、信号和断言，不含真实资源。

组件卸载测试：运行 `node test/request-safety-unmount-server.mjs`，打开 `http://127.0.0.1:3123/`，执行同一函数；它在mock安装后挂载真实SearchApp，并增加三个实际unmount场景。该fixture不提供API、不使用数据库。验收服务已在验证结束后停止；需重跑时手工启动。

## 自审与剩余限制

- 初版及含64KiB补丁的v2均已由用户确认独立代码审查通过；人工Preview验收仍待授权。本次仅做本地Git交付。
- 真实Vercel断连至request.signal传播、宿主连接回收时机未验证；本地信号/reader/loopback证据不能替代。60s应用deadline仍提供独立兜底。
- 已通过真实React组件卸载验证，不以页面刷新冒充卸载；单元层另已验证context/timer/listener和reader回收。测试fixture不复现Vercel宿主生命周期。
- 对不合作的自定义fetch/reader，应用可以停止等待并发出abort/cancel，不能保证第三方实现立即释放其内部资源。迟到Response另行取消body并有测试。
- JavaScript同步解析无法被计时器抢占；上游响应受1MiB约束。追加补丁对三个高德Route的入站请求体限制为64KiB，并保留取消清理；这是应用接受并累计的字节限制，不是网络/运行时内存峰值保证。没有扩展为完整入站资源限制工程。
- 性能诊断分支未合并；以后需合并其Route日志包装并补验状态统计，不能把终止异常计为已隔离普通失败。诊断参数位置保留，未自动整理旧分支。
- 不运行真实npm run smoke、正式高德、数据库集成、k6、WAF、Preview/Production部署。v2独立审查通过；Preview断连验收和参数冻结未完成。

停止点：当前分支本地提交后等待Preview授权，不启动Stage B/C/D、不推送、不创建PR或部署。两个完整独立审查包是本地上传附件，不纳入Git交付；必要验证说明与机器证据随代码提交。
