# 历史记录直接周边搜索：本地实施与验收

日期：2026-10-05。授权来源：用户在完整方案展示后回复“我确认授权”。本地代码、迁移文件、自审及可执行验证已完成；线上数据库迁移与发布未执行，真实 PostgreSQL 持久化集成未验证。

## 已实现行为

- 首次周边搜索成功或部分成功后，历史写入完整 confirmedLocation：名称、经纬度、地址、城市、区县、地点类型及可空高德 POI ID。服务端拒绝缺少名称/坐标或不合法的类别/半径；地址本身没有 POI ID 时正常保存。
- 点击历史直接恢复确认中心与原类别/半径并请求 `/api/search`；不调用 `/api/resolve-location`，不显示候选或要求再提交。每次重新查询，结果不保存为历史快照。
- 去重加入确认中心坐标，相同输入选中不同中心分别保存；同中心同条件更新地点元数据及搜索时间。
- 旧数据库行不删除、不改写；读取先排除 SQL NULL 中心，再按有效完整记录计算最近10/20条。对非空但损坏的 JSON 使用有序 cursor 批量跳过，不让其挤掉有效项。
- 历史标题显示已确认名称和已有地址，原输入仍保留并恢复。历史入口、输入和清空在请求进行中可操作；requestId 阻止被新操作取代的响应更新结果或保存历史。

## 执行的验证

| 检查 | 实际结果 |
| --- | --- |
| npm test | PASS，103/103 |
| npm run check | PASS，core + Next typegen + web TypeScript |
| npm run build | PASS，core + Next production build |
| npx prisma generate | PASS，生成对应新字段的本地 client；生成文件原有忽略规则不变 |
| npx prisma validate | PASS，仅 schema 验证，不连接或迁移数据库 |
| git diff --check | PASS，只有原有 LF/CRLF 提示 |
| 实际浏览器交互 | PASS，Codex 内置浏览器，实际生产构建页面 + 隔离测试接口 |
| 真实 PostgreSQL + 真实高德搜索 | NOT RUN；没有可用本地 PostgreSQL、psql 或 Docker；未安装依赖、连接生产 DB、执行在线迁移或调用真实高德 |

新增测试覆盖完整地点读写、非法坐标/缺失字段拒绝、地址地点 id=null、不同中心去重、同中心元数据更新、旧行不改写、10/20有效记录补齐以及前端丢弃损坏记录。保留既有匿名归属、旧响应、删除回滚和历史缓存测试。

## 实际浏览器证据与边界

测试服务器：`test/history-browser-server.mjs`。实际调用编译后的 history Route Handler、service、repository，以及 confirmed search validator/service；仅在数据库与高德边界提供隔离内存记录和合成地点。页面与静态资源由真实 Next production build 提供。不是真实 PostgreSQL 持久化证据，不是线上验收，不是高德地点质量测试。

已执行场景：

1. 预置25条没有中心的旧记录：页面历史显示为空，25条仍保留。
2. 首次输入“深圳北站”，出现东/西两个候选，选择西广场，再选择酒店/火锅及2km并搜索。实际 POST history 保存所有确认字段。
3. 刷新页面，读取历史并单击：自动使用西广场原坐标114.025,22.609及原条件查询；结果由版本1更新为版本2，没有第二次地点解析或候选确认。
4. 同样的原输入选择东广场114.032,22.609，条件相同：另存一项，列表显示不同的确认名称与地址。
5. 西广场查询延迟4秒，随后立即点击东广场：两个响应都完成后，页面仍为东广场及其新结果，只有最新操作保存历史，没有再次解析。
6. 历史查询返回HTTP 502：显示周边失败，保留确定中心，不出现候选，也不新增成功历史。
7. 酒店类别失败、火锅成功：显示火锅新结果，保留单类别失败提示及“全部”视图，正常保存完整中心。
8. 东广场慢查询中修改地点输入：查询完成后新输入仍保留，不回填旧结果、不保存被放弃的历史。
9. 键盘 Enter 选择历史：直接查询并出现西广场最新结果7。
10. 390px移动视口展示长名称/长地址及三条完整历史：document宽度等于390，删除按钮可用且右边缘约348.7px；点击西广场可直接显示结果，没有候选。1280px桌面document宽度等于1280。

最终隔离接口日志：[browser-api.json](history-confirmed-location-evidence/browser-api.json)。其中只有两次首次确认候选操作调用 resolve；所有历史回放不调用 resolve。最终仍保留25条旧记录与3条完整记录（第三条为长地址显示测试）。

验收版本的运行时源文件、schema和迁移文件哈希：[source-hashes.json](history-confirmed-location-evidence/source-hashes.json)。可复现隔离浏览器环境：先运行 `npm run build`，在一个终端执行 `node node_modules/next/dist/bin/next start -p 3108`，另一个终端执行 `node --experimental-test-module-mocks --experimental-loader ./test/history-route-loader.mjs --conditions=react-server test/history-browser-server.mjs`，访问 `http://localhost:3107`。该地址使用合成数据，不能当成生产预览。

截图与DOM：[桌面结果](history-confirmed-location-evidence/desktop-results.png)、[移动历史](history-confirmed-location-evidence/mobile-history.png)、[移动结果视口](history-confirmed-location-evidence/mobile-results-viewport.png)，以及同目录 DOM 文本。已实际查看桌面结果和移动历史截图；移动结果全页截图一次失败后改存视口截图，结果DOM与宽度检查正常。没有 Firefox/Safari 独立覆盖。

## 审查与修正

同一 Agent 自审，没有独立审查。检查了计划符合度、保存时机、中心/原条件一致性、匿名隔离、JSON规范化与公共响应字段、cursor读取、去重、失败及过期响应。

- 实施中定位 Prisma JSON 类型与 Node 测试生成代码边界：用具体结构的确认字段副本连接 JSON 类型；生成 client 的 null sentinel 在单测DB边界模拟，实际 Next构建使用真实 client。
- 浏览器发现同一输入的两条不同中心历史原标题相同，改为确认名称和地址显示，重新构建并验证。
- 并发场景发现原页面禁用历史与输入导致无法切换，解除这几个入口的禁用；重新审查 requestId 覆盖，重新执行最终103/103、check/build及上述浏览器场景。
- 失败状态初次断言读得过早，改为等待实际错误文字可见；没有因此改动产品错误处理。

## 用户人工核验

2026-10-05，用户在 `http://localhost:3107/` 隔离测试入口人工核验后明确回复“通過”。记录为本地交互人工验收通过；该环境使用内存数据库与合成高德数据，不构成真实数据库持久化、高德集成或线上发布验收，也不新增迁移或部署授权。

## 迁移与上线前置

迁移文件：`prisma/migrations/20261005000000_add_confirmed_history_location/migration.sql`，仅新增可空JSONB字段，不回填、删除或猜测旧地点。

线上必须先应用该迁移，再发布新代码，随后用隔离测试访客验证真实保存→读回→刷新→点击历史的完整链路。待环境及发布范围获得授权后执行：

```powershell
npx prisma migrate deploy --config prisma7.config.ts
```

该命令本轮没有执行。代码部署到尚未增加字段的数据库会导致历史读写失败；本地API的内存验证不消除此上线前置。旧浏览器提交缺少中心的POST会被新接口拒绝，已取得的周边结果不受 best-effort 历史保存失败影响。

当前可交付：本地实现及迁移文件；仍需线上迁移、发布和真实集成验收。没有Git提交、推送或部署。
