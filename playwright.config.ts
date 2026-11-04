import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/browser",
  globalSetup: "./e2e/check-build.mjs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  globalTimeout: 180_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/browser/results.json" }], ["./e2e/evidence-reporter.ts"], ["html", { outputFolder: "playwright-report/browser", open: "never" }]],
  outputDir: "test-results/browser",
  use: {
    baseURL: "http://127.0.0.1:3119",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node e2e/start-server.mjs browser",
    url: "http://127.0.0.1:3119",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
