import { defineConfig } from "@playwright/test";

const placeholderDatabase = "postgresql://ci:ci@localhost:5432/nearby_ci";

export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3187",
    browserName: "chromium",
    channel: "chrome",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    { command: "node node_modules/next/dist/bin/next start -p 3188 --hostname 127.0.0.1", url: "http://127.0.0.1:3188", reuseExistingServer: false,
      env: { DATABASE_URL: placeholderDatabase, DIRECT_URL: placeholderDatabase }, timeout: 45_000 },
    { command: "node --experimental-test-module-mocks --experimental-loader ./test/history-route-loader.mjs --conditions=react-server test/history-browser-server.mjs", url: "http://127.0.0.1:3187", reuseExistingServer: false,
      env: { HISTORY_UI_PORT: "3188", HISTORY_BROWSER_PORT: "3187" }, timeout: 45_000 },
  ],
});
