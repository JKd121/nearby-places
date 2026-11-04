import { defineConfig } from "@playwright/test";
import browserConfig from "./playwright.config";

export default defineConfig({
  ...browserConfig,
  testDir: "./e2e/integration",
  globalSetup: "./e2e/setup-history.mjs",
  reporter: [["list"], ["json", { outputFile: "test-results/history/results.json" }], ["./e2e/evidence-reporter.ts"], ["html", { outputFolder: "playwright-report/history", open: "never" }]],
  outputDir: "test-results/history",
  use: { ...browserConfig.use, baseURL: "http://127.0.0.1:3120" },
  webServer: {
    command: "node e2e/start-server.mjs history",
    url: "http://127.0.0.1:3120",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
