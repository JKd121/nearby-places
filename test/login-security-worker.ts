import { configureIdentityTest } from "./identity-test-runtime.js";
configureIdentityTest();
if (process.env.LOGIN_WORKER_ACTION === "secure-cookie") process.env.BETTER_AUTH_URL = "https://nearby-security.example";
const { POST } = await import("../app/api/auth/[...all]/route.js");
const { prisma } = await import("../src/db/prisma.js");
try {
  if (process.env.LOGIN_WORKER_ACTION === "secure-cookie") {
    const response = await POST(new Request("https://nearby-security.example/api/auth/sign-in/email", { method: "POST", headers: { origin: "https://nearby-security.example", "content-type": "application/json", "x-vercel-forwarded-for": "203.0.113.17" }, body: JSON.stringify({ email: process.env.LOGIN_WORKER_EMAIL, password: process.env.LOGIN_WORKER_PASSWORD }) }));
    const cookie = response.headers.getSetCookie().find(value => value.includes("session_token=")) ?? "";
    process.stdout.write(JSON.stringify({ status: response.status, secure: /; Secure/i.test(cookie), httpOnly: /; HttpOnly/i.test(cookie), sameSite: /; SameSite=Lax/i.test(cookie) }));
  } else {
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await POST(new Request("http://localhost:3127/api/auth/sign-in/email", { method: "POST", headers: { origin: "http://localhost:3127", "content-type": "application/json" }, body: JSON.stringify({ email: "worker-missing@example.test", password: "WrongPassword!" }) }))).status);
  process.stdout.write(JSON.stringify(statuses));
  }
} finally { await prisma.$disconnect(); }
