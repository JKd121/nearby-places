# Lint 的 Minimatch 11 兼容补丁

2026-11-05：沿用已确认的 ESLint 9.39.5 与 Next 配套规则，通过 Minimatch 11.0.4 清理依赖告警。

## 补丁范围

| 包 | 固定版本 | 适配 |
| --- | --- | --- |
| eslint-plugin-react | 7.37.5 | 5 个规则的函数式导入改为命名导出 minimatch |
| eslint-plugin-import | 2.32.0 | 7 个规则的导入；no-internal-modules 用 Minimatch.match 替代已移除的 makeRe／RegExp.test |
| eslint-plugin-jsx-a11y | 6.10.2 | 2 个辅助函数的命名导入 |

补丁保持规则配置、报告条件和检查等级。`no-internal-modules` 仍对完整导入路径应用原有 allow／forbid glob；使用新版的匹配 API 执行。

## 安装与验证

`package.json` 的 overrides 将所有 Minimatch 依赖解析为 11.0.4；`postinstall` 先执行 `patch-package --error-on-fail`，再按显式 Prisma 配置生成客户端。补丁作为源码保存，完整 `npm ci` 自动复现。

`npm run test:lint-compat` 验证：

- React 属性限制和组件名例外；
- 禁止访问包内部路径；
- 自定义表单控件的可访问性标签；
- globstar、花括号、大小写和隐藏文件匹配；
- 真实项目配置对源文件与生成目录的包含／忽略；
- 在独立临时夹具中破坏上游文件，确认严格补丁应用返回失败。

当前测试版本下的补丁已与锁文件一起验证。升级任一被补丁覆盖的包时，重新核对差异并执行干净安装、兼容测试和完整回归。

## 移除条件

上游插件正式支持已修复的 Minimatch，且相同正反例、全量 Lint 和依赖审计通过后，逐包移除补丁。全部补丁移除后再移除 patch-package 安装步骤与依赖；保留 Prisma 的显式配置生成命令。

参考：[Minimatch 公告](https://github.com/advisories/GHSA-g3hv-75wg-m249)、[patch-package](https://github.com/ds300/patch-package)。
