import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [operation, ...args] = process.argv.slice(2);
const email = args[args.indexOf("--email") + 1];
if (process.env.NEARBY_BETA_MANAGEMENT !== "1" || !email) throw new Error("请通过 beta:init 或 beta:account 调用管理命令");
if (operation !== "disable" && !process.stdout.isTTY) throw new Error("创建和重置密码请在交互终端运行，初始密码仅展示一次");
const { prisma } = await import("../src/db/prisma.js");
const { createTestAccount, manageTestAccount } = await import("../src/identity/test-accounts.js");
const { saveCredential } = await import("../src/identity/credentials.js");
try {
  if (operation === "init-developer") {
    const path = resolve(".local/nearby-beta/developer.json");
    let owner: { userId: string; email: string; imported?: boolean } | undefined;
    try { owner = JSON.parse(await readFile(path, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (owner) {
      const user = await prisma.user.findUnique({ where: { id: owner.userId } });
      if (!user || user.email !== email.toLowerCase().trim() || owner.email !== user.email) throw new Error("开发者账号记录不匹配，已保留原数据");
      if (!user.betaAccess && !user.disabledAt) await prisma.user.update({ where: { id: user.id }, data: { betaAccess: true } });
      console.log("开发者账号已存在，保留密码和 Key；忘记密码可运行 beta:account reset-password。");
    } else {
      const key = process.env.AMAP_WEB_SERVICE_KEY;
      if (!key || !/^[a-f0-9]{32}$/i.test(key.trim())) throw new Error("请在服务端配置有效的 AMAP_WEB_SERVICE_KEY，再初始化开发者账号");
      const account = await createTestAccount(email);
      // Save ownership before importing so an interrupted initialization can be inspected safely.
      await writeFile(path, JSON.stringify({ userId: account.userId, email: account.email }), { mode: 0o600, flag: "wx" });
      console.log(`账号：${account.email}\n初始密码（仅本次展示）：${account.password}`);
      await saveCredential(account.userId, key);
      console.log("已有高德 Key 已加密导入，首次搜索验证。");
    }
  } else if (operation === "create") {
    const account = await createTestAccount(email);
    console.log(`账号：${account.email}\n初始密码（仅本次展示）：${account.password}`);
  } else if (operation === "reset-password" || operation === "disable") {
    const result = await manageTestAccount(email, operation);
    console.log(result.password ? `新密码（仅本次展示）：${result.password}\n旧会话已撤销。` : "账号已停用，旧会话已撤销。");
  } else throw new Error("未知账号操作");
} catch { console.error("账号操作失败；请检查账号冲突、加密配置、目标库和迁移状态。现有账号冲突时会保留原数据。"); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
