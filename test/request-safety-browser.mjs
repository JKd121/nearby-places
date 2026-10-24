/** Run this exported function in the built application's browser page.
 * All /api requests are replaced in-page. No provider/database resources are used.
 */
export async function runRequestSafetyBrowser() {
  const originalFetch = window.fetch;
  const calls = []; const checks = []; const unhandled = [];
  const onUnhandled = event => unhandled.push(String(event.reason));
  window.addEventListener("unhandledrejection", onUnhandled);
  const started = performance.now();
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));
  async function until(predicate, label) {
    const end = performance.now() + 2500;
    while (!predicate()) { if (performance.now() > end) throw Error(`Timed out: ${label}`); await tick(); }
  }
  function check(condition, label) { if (!condition) throw Error(label); checks.push(label); }
  const visible = node => !!node && node.getClientRects().length > 0;
  function button(text) { return [...document.querySelectorAll("button")].find(node => visible(node) && (node.textContent.trim() === text || node.getAttribute("aria-label") === text || (text === "加载更多" && node.textContent.trim().startsWith("加载更多（")))); }
  async function click(text) { const node = button(text); if (!node) throw Error(`Missing button ${text}`); node.click(); await tick(); }
  async function input(value) {
    const node = document.querySelector('input[aria-label="地点"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true })); await tick();
  }
  const location = { id: "fixture", name: "受控中心", placeType: "酒店", city: "深圳市", district: "龙华区", address: "模拟地址", location: { longitude: 114, latitude: 22 } };
  const historyItem = { id: "stage-a-history", query: "历史回放", categoryIds: ["hotel"], radiusMeters: 3000, confirmedLocation: location, searchedAt: "2026-10-24T00:00:00.000Z" };
  const category = { key: "hotel", label: "酒店", group: "stay", keyword: "酒店", types: [], strategy: "types-only", priceMode: "none" };
  const places = Array.from({ length: 25 }, (_, i) => ({ id: `fixture-${i}`, name: `模拟地点${i}`, category: "hotel", longitude: 114, latitude: 22, distanceMeters: i + 1, distanceSource: "amap", amapDistanceMeters: i + 1, computedDistanceMeters: i + 1, parentId: null, type: null, typecode: null, cost: null, rating: null, tag: null, openTimeToday: null, openTimeWeek: null, address: "模拟地址" }));
  const success = { status: "success", resolvedLocation: { ...location.location, query: "fixture", formattedAddress: "模拟地址", province: null, city: location.city, district: location.district, level: null }, categories: [{ category, status: "success", places, page: { pageNumber: 1, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: true }, error: null }] };
  let searchMode = "success"; let pageMode = "failure";
  const json = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }));
  window.fetch = (url, init = {}) => {
    const path = String(url);
    if (!path.startsWith("/api/")) return originalFetch(url, init);
    const call = { path, method: init.method ?? "GET", signal: init.signal, body: init.body ? JSON.parse(init.body) : null, aborted: false, finish: null };
    calls.push(call);
    init.signal?.addEventListener("abort", () => { call.aborted = true; }, { once: true });
    if (path.startsWith("/api/history")) return json(call.method === "POST" ? { item: historyItem } : { items: [historyItem] });
    if (path === "/api/resolve-location") {
      if (call.body.query.startsWith("慢")) return new Promise(resolve => { call.finish = () => resolve(new Response(JSON.stringify({ status: "confirmed", location: { ...location, name: "不应覆盖的新旧冲突" } }))); });
      return json({ status: "confirmed", location });
    }
    if (path === "/api/search") {
      if (searchMode === "pending") return new Promise(resolve => { call.finish = () => resolve(new Response(JSON.stringify(success))); });
      if (searchMode === "failure") return json({ error: { message: "请求超时，请稍后再试", code: "UPSTREAM_TIMEOUT" } }, 504);
      return json(success);
    }
    if (path === "/api/search/page") {
      if (pageMode === "pending") return new Promise(resolve => { call.finish = () => resolve(new Response(JSON.stringify({ categoryId: "hotel", page: { places: [], pageNumber: 2, pageSize: 25, returnedCount: 0, mayHaveNextApiPage: false } }))); });
      return json({ error: { message: "服务暂不可用，请稍后再试" } }, 502);
    }
    throw Error(`Unexpected mock endpoint ${path}`);
  };
  // The history store captures fetch on mount. The pre-navigation dispatcher must
  // delegate to this mock too; replacing window.fetch after mount alone is insufficient.
  window.__stageAFetch = window.fetch;
  if (window.fixtureMount) window.fixtureMount();
  try {
    await input("慢解析"); await click("解析地点");
    const staleResolve = calls.at(-1); check(staleResolve.path === "/api/resolve-location" && !!staleResolve.signal, "解析请求带signal");
    await input("新地点"); check(staleResolve.aborted, "输入变化取消旧解析"); staleResolve.finish(); await tick();
    check(!document.body.innerText.includes("不应覆盖的新旧冲突"), "忽略不配合取消的旧解析响应");
    await click("解析地点"); await until(() => !!button("搜索附近"), "resolved");
    searchMode = "pending"; await click("搜索附近");
    const staleSearch = calls.at(-1); const savesBefore = calls.filter(c => c.path === "/api/history" && c.method === "POST").length;
    await input("下一地点"); check(staleSearch.aborted, "输入变化取消附近搜索"); staleSearch.finish(); await tick();
    check(calls.filter(c => c.path === "/api/history" && c.method === "POST").length === savesBefore, "旧搜索响应不保存历史");
    searchMode = "failure"; await click("解析地点"); await click("搜索附近");
    await until(() => document.body.innerText.includes("请求超时，请稍后再试"), "safe timeout message"); check(!!button("重新搜索"), "整体失败复用现有错误与重试组件");
    searchMode = "success"; await click("重新搜索"); await until(() => document.querySelectorAll("h3").length > 0, "results");
    check(calls.at(-2)?.signal || calls.some(c => c.path === "/api/search" && c.signal), "搜索请求带signal");
    await click("酒店");
    while (button("加载更多")) await click("加载更多");
    await until(() => !!button("获取更多附近结果"), "provider page button");
    await click("获取更多附近结果"); await until(() => document.body.innerText.includes("服务暂不可用，请稍后再试"), "page failure");
    check(document.querySelectorAll("h3").length === 25, "第二页失败保留第一页结果");
    pageMode = "pending"; await click("获取更多附近结果"); const stalePage = calls.at(-1);
    await input("切换地点"); check(stalePage.aborted && !!stalePage.signal, "新条件取消第二页请求"); stalePage.finish(); await tick();
    searchMode = "pending"; await click("最近搜索"); await until(() => [...document.querySelectorAll("button")].some(b => b.textContent.includes("受控中心") && visible(b)), "history item");
    const resolvesBefore = calls.filter(c => c.path === "/api/resolve-location").length;
    [...document.querySelectorAll("button")].find(b => visible(b) && b.textContent.includes("受控中心")).click(); await tick();
    const replay = calls.at(-1); check(replay.path === "/api/search" && replay.body.categoryIds.join() === "hotel" && replay.body.radiusMeters === 3000, "历史回放沿用中心及条件");
    check(calls.filter(c => c.path === "/api/resolve-location").length === resolvesBefore, "历史回放不重复解析");
    await input("终止回放"); check(replay.aborted, "历史回放可取消"); replay.finish(); await tick();
    check(!document.body.innerText.includes("附近搜索未完成"), "主动取消不显示搜索失败");
    if (window.fixtureUnmount) {
      window.fixtureUnmount();
      for (const phase of ["resolve", "search", "page"]) {
        window.fixtureMount();
        searchMode = phase === "search" ? "pending" : "success";
        pageMode = "pending";
        await input(phase === "resolve" ? "慢卸载解析" : "卸载测试"); await click("解析地点");
        if (phase !== "resolve") await click("搜索附近");
        if (phase === "page") {
          await click("酒店"); while (button("加载更多")) await click("加载更多");
          await click("获取更多附近结果");
        }
        const pending = calls.at(-1); check(!!pending.finish && !!pending.signal, `${phase}卸载前请求确实挂起`);
        window.fixtureUnmount(); check(pending.aborted, `${phase}组件卸载取消请求`);
        pending.finish(); await tick();
      }
    }
    check(unhandled.length === 0, "没有未处理Promise拒绝");
    return { checks, durationMs: Math.round(performance.now() - started), calls: calls.map(({ path, method, aborted, signal }) => ({ path, method, aborted, hasSignal: !!signal })), unhandled };
  } finally { window.__stageAFetch = null; window.fetch = originalFetch; window.removeEventListener("unhandledrejection", onUnhandled); }
}
