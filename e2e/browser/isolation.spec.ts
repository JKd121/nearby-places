import { test, expect } from "@playwright/test";
import { installApiMocks } from "../fixtures";

test("模拟隔离器记录未知接口、错误方法和外部请求", async ({ page }) => {
  const api = await installApiMocks(page);
  await page.goto("/");
  expect(await page.evaluate(async () => (await fetch("/api/unknown")).status)).toBe(500);
  expect(await page.evaluate(async () => (await fetch("/api/search")).status)).toBe(500);
  expect(await page.evaluate(async () => {
    try { await fetch("https://example.invalid/blocked"); return "unexpected"; }
    catch { return "blocked"; }
  })).toBe("blocked");
  expect(api.unexpected).toEqual(["GET /api/unknown", "GET /api/search", "GET https://example.invalid/blocked"]);
});
