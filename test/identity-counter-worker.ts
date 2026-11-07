import { configureIdentityTest } from "./identity-test-runtime.js";
configureIdentityTest();
const { consumeCounter } = await import("../src/identity/rate.js");
const { prisma } = await import("../src/db/prisma.js");
let allowed = 0;
for (let i = 0; i < 10; i++) if ((await consumeCounter("process-counter", 60, 3)).allowed) allowed++;
process.stdout.write(String(allowed));
await prisma.$disconnect();
