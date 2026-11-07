import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e", fullyParallel: false, workers: 1, timeout: 60000,
  expect: { timeout: 15000 },
  use: { baseURL: "http://localhost:3127", trace: "retain-on-failure", screenshot: "only-on-failure" },
  reporter: [["list"], ["html", { outputFolder: ".local/byok-playwright-report", open: "never" }]],
  outputDir: ".local/byok-playwright-results",
  webServer: { command: "npx tsx test/e2e-server.ts", url: "http://localhost:3127", timeout: 120000, reuseExistingServer: false },
});
