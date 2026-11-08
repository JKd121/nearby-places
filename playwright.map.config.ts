import { defineConfig } from "@playwright/test";

const existingUrl = process.env.NEARBY_MAP_TEST_EXISTING_URL;

export default defineConfig({
  testDir: "./test/map-e2e", fullyParallel: false, workers: 1, timeout: 60000,
  expect: { timeout: 15000 },
  use: { baseURL: existingUrl ?? "http://localhost:3136", trace: "retain-on-failure", screenshot: "only-on-failure", viewport: { width: 1440, height: 1000 } },
  reporter: [["list"], ["html", { outputFolder: ".local/map-playwright-report", open: "never" }]],
  outputDir: ".local/map-playwright-results",
  ...(existingUrl ? {} : { webServer: { command: "node test/map-e2e-server.mjs", url: "http://localhost:3136", timeout: 120000, reuseExistingServer: false } }),
});
