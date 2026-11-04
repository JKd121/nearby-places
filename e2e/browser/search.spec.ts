import { test, expect, center, confirmCenter, selectHotel, searchResponse } from "../fixtures";

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("候选确认、类别、半径、结果和排序", async ({ page, api }) => {
  await confirmCenter(page);
  await selectHotel(page);
  await page.getByRole("radio", { name: "2 km", exact: true }).check();
  api.count = 2;
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  const region = page.getByRole("region", { name: "附近结果列表" });
  await expect(region.getByRole("heading", { name: "合成hotel地点1", exact: true })).toBeVisible();
  await expect(region.getByRole("heading", { level: 3 })).toHaveCount(2);
  expect(api.searches).toEqual([expect.objectContaining({ categoryIds: ["hotel"], radiusMeters: 2000, center: center.location })]);
  await expect(page.getByRole("combobox")).toHaveValue("distance-asc");
  await page.getByRole("button", { name: "酒店", exact: true }).click();
  await page.getByRole("combobox").selectOption("rating-desc");
  await expect(region.getByRole("heading", { level: 3 }).first()).toHaveText("合成hotel地点2");
});

for (const mode of ["partial", "all-error"] as const) {
  test(`${mode}：逐类失败反馈与成功结果`, async ({ page, api }) => {
    await confirmCenter(page);
    await selectHotel(page);
    await page.getByRole("checkbox", { name: "商场", exact: true }).check();
    api.mode = mode;
    await page.getByRole("button", { name: "搜索附近", exact: true }).click();
    await expect(page.getByText(mode === "partial" ? "部分服务类别暂不可用" : "本次搜索的类别均未成功", { exact: true })).toBeVisible();
    const result = page.getByRole("heading", { name: "合成hotel地点1", exact: true });
    if (mode === "partial") await expect(result).toBeVisible();
    else await expect(result).toHaveCount(0);
    await page.getByRole("button", { name: "商场 · 失败", exact: true }).click();
    await expect(page.getByText("合成上游暂不可用", { exact: true })).toBeVisible();
  });
}

test("超时显示错误，并能重新搜索", async ({ page, api }) => {
  await confirmCenter(page); await selectHotel(page);
  api.mode = "timeout";
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.getByText("合成请求超时，请稍后再试", { exact: true })).toBeVisible();
  api.mode = "success";
  await page.getByRole("button", { name: "重新搜索", exact: true }).click();
  await expect(page.getByRole("heading", { name: "合成hotel地点1", exact: true })).toBeVisible();
});

test("分页失败保留首批结果，重试追加第二页", async ({ page, api }) => {
  await confirmCenter(page); await selectHotel(page); api.count = 25;
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await page.getByRole("button", { name: "酒店", exact: true }).click();
  const more = page.getByRole("button", { name: /^加载更多（/ });
  while (await more.count()) await more.click();
  await page.getByRole("button", { name: "获取更多附近结果", exact: true }).click();
  await expect(page.getByText("更多地点加载失败", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^合成hotel地点/ })).toHaveCount(25);
  api.pageFails = false;
  await page.getByRole("button", { name: "重试加载", exact: true }).click();
  await expect(page.getByRole("heading", { name: "合成hotel地点26", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^合成hotel地点/ })).toHaveCount(26);
  expect(api.pageCalls).toBe(2);
});

test("输入变化取消挂起的搜索", async ({ page }) => {
  await confirmCenter(page); await selectHotel(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/search", async route => { await gate; await route.fulfill({ json: searchResponse(["hotel"]) }).catch(() => {}); });
  const sent = page.waitForRequest("**/api/search");
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  const request = await sent;
  const cancelled = page.waitForEvent("requestfailed", candidate => candidate === request);
  await page.getByRole("textbox", { name: "地点", exact: true }).fill("新的地点");
  await cancelled;
  release();
  await expect(page.getByText("从一个地点开始", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "合成hotel地点1", exact: true })).toHaveCount(0);
});

test("忽略未配合取消的迟到响应，保留新搜索结果", async ({ page }) => {
  // This controlled fetch intentionally ignores AbortSignal, exercising the stale-result guard.
  await page.evaluate(() => {
    const original = window.fetch;
    const state = window as typeof window & { releaseOld?: () => void; oldSettled?: boolean };
    let first = true;
    window.fetch = (input, init) => {
      if (String(input) === "/api/search" && first) {
        first = false;
        return new Promise<Response>(resolve => {
          state.releaseOld = () => {
            state.oldSettled = true;
            resolve(Response.json({ categories: [], status: "success", resolvedLocation: {} }));
          };
        });
      }
      return original(input, init);
    };
  });
  await confirmCenter(page); await selectHotel(page);
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { releaseOld?: unknown }).releaseOld)).toBe("function");
  await page.getByRole("textbox", { name: "地点", exact: true }).fill("新一轮搜索");
  await confirmCenter(page); await selectHotel(page);
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.getByRole("heading", { name: "合成hotel地点1", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    (window as typeof window & { releaseOld?: () => void }).releaseOld!();
    // Drain promise continuations and React's next render without a fixed timer.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(page.getByRole("heading", { name: "合成hotel地点1", exact: true })).toBeVisible();
});

test("历史刷新、直接回放和删除", async ({ page, api }) => {
  await confirmCenter(page); await selectHotel(page);
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await page.getByRole("button", { name: "最近搜索", exact: true }).click();
  const history = page.getByRole("region", { name: "搜索历史" });
  await expect(history.getByRole("button", { name: new RegExp(`^${center.name}`) })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "最近搜索", exact: true }).click();
  await history.getByRole("button", { name: new RegExp(`^${center.name}`) }).click();
  await expect(page.getByRole("heading", { name: "合成hotel地点1", exact: true })).toBeVisible();
  expect(api.resolveCalls).toBe(1);
  expect(api.searches).toHaveLength(2);
  await page.getByRole("button", { name: "最近搜索", exact: true }).click();
  await page.getByRole("button", { name: `删除这条搜索历史：${center.name}`, exact: true }).click();
  await expect(page.getByText("暂无搜索历史", { exact: true })).toBeVisible();
});

test("手机尺寸支持键盘确认、搜索和历史导航", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const input = page.getByRole("textbox", { name: "地点", exact: true });
  await input.fill("合成测试中心"); await input.press("Enter");
  const candidate = page.getByRole("button", { name: `选用此地点：${center.name}`, exact: true });
  await candidate.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "附近结果", exact: true })).toBeFocused();
  await selectHotel(page);
  const search = page.getByRole("button", { name: "搜索附近", exact: true });
  await search.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "合成hotel地点1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "最近搜索", exact: true }).click();
  await expect(page.getByRole("heading", { name: "最近搜索", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test("空结果显示调整条件提示，类别状态为空", async ({ page, api }) => {
  await confirmCenter(page); await selectHotel(page); api.count = 0;
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.getByText("当前范围内暂无结果", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^合成hotel地点/ })).toHaveCount(0);
  await page.getByRole("button", { name: "酒店 · 空", exact: true }).click();
  await expect(page.getByText("当前类别没有结果", { exact: true })).toBeVisible();
  expect(api.searches).toHaveLength(1);
});
