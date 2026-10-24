# Stage A 入站请求体限制补丁

状态：用户已明确确认Stage A v2独立审查通过，包括64KiB补丁，未发现阻止Preview的新增P1/P2；目前仅授权本地Git提交，Preview尚未授权或执行。本次重新核对受审源码哈希并执行test/check/build，记录见 `request-safety-stage-a-local-delivery.json`。

## 批准范围

用户明确批准仅三个高德业务Route统一64KiB入站JSON候选上限、实际字节累计、解码前判定、超限停止读取并取消reader、独立请求级终止异常及安全HTTP413。保持400/499/504、不触及历史接口或数据库/WAF/性能优化。不提交、推送或部署，不新建分支/Worktree。

## 实际修改

| 文件 | 修改 |
| --- | --- |
| src/amap/policy.ts | 集中新增maxRequestBytes=65536，不引入新的环境配置 |
| src/server/request-policy.ts | 请求策略类型及已有显式覆盖分支均携带该入站值，避免配置路径遗漏 |
| src/amap/errors.ts | 在现有共享异常协议中增加RequestBodyTooLargeError及REQUEST_BODY_TOO_LARGE终止分类，不新增异常框架 |
| src/server/request-lifecycle.ts | 必传入站上限；逐块计数，解码/累积前判断；超限先abort请求上下文并抛出413错误，finally取消reader、释放锁 |
| src/server/http.ts | 固定安全413消息和REQUEST_BODY_TOO_LARGE code；安全日志保持独立分类 |
| app/api/resolve-location/route.ts | 传入统一上限；已有throwIfAborted重抛请求级异常，不误报400 |
| app/api/search/route.ts | 同上，读取失败不进入搜索服务 |
| app/api/search/page/route.ts | 同上，读取失败不进入第二页服务 |
| test/request-lifecycle.test.ts | 精确64KiB/+1、分块/跨块多字节、虚假长度、reader取消/锁释放/无继续pull、请求abort与业务不继续 |
| test/request-safety-route.test.ts | 三Route精确边界成功、+1字节安全413/零高德调用/单条脱敏日志、迟到取消不改413；三Route各复验400/499/504 |

没有依赖、锁文件、历史API、数据库、高德客户端、性能Worktree或UI改动。补丁沿用当前中文分支和原基线df84cf2。

## 行为与资源边界

- 上限包括JSON本体与空白，按reader交付的Uint8Array实际字节累计，不信任Content-Length；刚好65536字节允许继续业务校验，65537字节终止为413。
- 超限块不进入TextDecoder或parts。已读数据及超限块仍可能由底层分配，运行时也可能预读；因此64KiB不是底层网络内存峰值上限。
- 超限即请求级abort；三个Route的宽泛JSON catch通过throwIfAborted保留413。入站读取后的业务/高德不会执行，reader的cancel不被等待阻塞响应，lock在finally释放。
- 取消/总时限先被观察时仍保持499/504；超限先决定后迟到取消不改变413。普通非法JSON仍400。
- 8s、60s、1MiB、64KiB是部署后实际生效的候选默认值；没有将其冻结为正式生产参数，也没有修改Vercel配置。

## 实际验证

- npm test：170/170通过（153项Node测试，17项AST架构检查），6689ms。
- npm run check：通过，6087ms。
- npm run build：通过，16496ms，生产路由范围未增加。
- git diff --check：通过。新增14项测试，其中5项读取/生命周期测试、9项三个Route回归；同时复跑此前156项。
- 补丁完成同Agent自审：阈值判断在解码前；已有显式策略覆盖路径保留64KiB；异常不会被400 catch吞掉；reader取消/请求终止有实测断言。不是独立复核。
- 机器证据：`request-safety-stage-a-inbound-evidence.json`；补丁验证命令：`request-safety-stage-a-inbound-commands.json`；提交前重验：`request-safety-stage-a-local-delivery.json`。两个完整审查包为本地上传附件，保留但不纳入Git提交，避免将大段重复源码当成项目文档交付。

未运行真实高德smoke、数据库操作、k6、WAF、Preview或Production部署。没有重跑浏览器自动化：本补丁没有改前端，先前14/20项仅作为未变前端的历史证据；新增行为由真实三个Route入口的隔离测试验证，不冒称Preview端到端验收。Vercel真实断连及候选参数验收仍待后续授权。

## 审查意见处置与停止点

- P2入站大小限制：本补丁完成且用户确认v2独立审查通过。
- beforeAttempt在catch外：留待Stage B明确预算拒绝/数据库故障的终止分类、安全日志和统一映射；本次不提前实现。
- P3 AST依赖限制范围：本次不调整。
- P3候选参数：Preview后决定正式参数。

停止：按用户最新授权完成当前分支本地提交后，等待Preview授权；不推送、不创建PR、不部署，不启动B/C/D。
