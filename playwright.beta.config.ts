import { defineConfig } from "@playwright/test";

export default defineConfig({
  testMatch: process.env.NEARBY_BETA_E2E_ACCESS_MODE === "local-beta" ? "**/local-login.spec.ts" : ["**/beta.spec.ts", "**/credential.spec.ts"],
  testDir: "./test/e2e-beta", fullyParallel: false, workers: 1, timeout: 60000,
  expect: { timeout: 15000 },
  use: { baseURL: "http://localhost:3127", trace: "retain-on-failure", screenshot: "only-on-failure" },
  reporter: [["list"], ["html", { outputFolder: ".local/nearby-beta-e2e/report", open: "never" }]],
  outputDir: ".local/nearby-beta-e2e/results",
  webServer: { command: "npx tsx --conditions=react-server test/beta-e2e-server.ts", url: "http://localhost:3127", timeout: 120000, reuseExistingServer: false },
});
