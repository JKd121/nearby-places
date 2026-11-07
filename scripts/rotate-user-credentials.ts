import "dotenv/config";
import { prisma } from "../src/db/prisma.js";
import { encryptCredential, decryptCredential } from "../src/identity/security.js";

// Default is a dry run. Encryption keys remain in the server environment.
const apply = process.argv.includes("--apply");
const version = Number(process.env.NEARBY_CREDENTIAL_KEY_VERSION ?? "1");
let changed = 0, conflicts = 0;
try {
  const rows = await prisma.userApiCredential.findMany({ where: { encryptionVersion: { not: version } } });
  for (const row of rows) {
    const data = encryptCredential(decryptCredential(row), row.userId);
    if (apply) {
      const result = await prisma.userApiCredential.updateMany({ where: { id: row.id, version: row.version, encryptionVersion: row.encryptionVersion }, data: { ...data, version: { increment: 1 } } });
      if (result.count === 1) changed++; else conflicts++;
    }
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", candidates: rows.length, changed, conflicts }));
} catch { console.error("Credential rotation failed; verify key versions and database configuration"); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
