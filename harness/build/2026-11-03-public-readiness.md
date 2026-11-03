# 公开前检查（2026-11-03）

基线 master 1d778f9。检查对象为准备公开的 GitHub 仓库内容，原工作区的私有 .local 数据保持本地。

## 覆盖与结果

| 对象 | 覆盖 | 结果与判定 |
| --- | --- | --- |
| Git | 18 个远端分支、20 个 PR head、75 个可达提交；含历史已删除文件 | Gitleaks 8.30.1 git 扫描 0 命中；受控抓取 refs 后扫描，未使用本地 stash 作为公开来源 |
| 文档与数据 | 249 个 Markdown／JSON／YAML／文本 blob 版本，针对 Cookie／访客标识、连接串和坐标另做候选核查 | 24 个候选版本：连接均为 loopback／占位；browser-api.json 和 fixture-evidence.json 中标识匹配 history-browser-server.mjs 合成访客；公共站点及模型字段有上下文 |
| 讨论 | 32 项 Issue／PR 对象、23 条顶层评论、0 条行内评论；PR 集合另作交叉核对 | 提取正文后 Gitleaks 0 命中；图片链接映射为已检查的仓库图片和 Vercel 官方状态徽标 |
| 图片 | 120 个唯一图片 blob（118 PNG、2 SVG）；已核对全历史无额外图片 blob | 人工缩览及夹具／原型源码对照；内容为合成 UI、公共深圳北站示例、静态访客资料、设计稿，未发现需移除的个人凭据或个人记录；SVG 无外部资源／脚本 |
| Actions | 29 次运行、58 个解压文本日志，产物总数 0 | Gitleaks 0 命中；原始日志保存在私有检查目录 |
| 部署 | Vercel 项目身份及现有 Production 提交 | READY，关联 1d778f9；gitForkProtection=true |

私有 API 元数据捕获中的 temp_clone_token 为 GitHub API 返回的临时字段，属于检查工具的私有元数据；该文件未进入仓库，正文扫描独立提取公开字段。

## 处置

当前核查无实际凭据轮换、历史改写或日志删除项。保留合成数据与历史证据；将公开后的主线保护配置和匿名读取结果补充在下方。工具报告、原始 API 返回、日志、图片检查索引保存在任务的私有目录，仅本记录进入 Git。

公开后主线要求 PR、GitHub Actions app 15368 的 Tests, types and build 检查、最新基线、讨论解决；required_approving_review_count=0，enforce_admins=true，关闭强推和删除。fork Preview 保护保持启用。

## 平台实际执行

- 已将仓库切换为 public。
- master 保护已启用：严格必需检查绑定 GitHub Actions app 15368；管理员约束开启，必需审批人数 0，讨论解决开启，强推／删除关闭。
- Production 已配置三个 secrets，令牌由用户在 GitHub 页面填写；本轮工具只读取密钥名称。
- 已清理 10 个满足清单条件的远端分支，保留草稿、原型、历史研究及所有本地分支和未提交成果。
