/** Install before hydration using the browser's init script. All /api calls stay local. */
export function installCategoryBrowserFixture() {
  const keys = ["hotel", "mall", "hotpot", "bakery", "dessert", "ktv", "billiards", "gym", "bus", "subway"];
  const labels = ["酒店", "商场", "火锅", "面包", "甜品", "KTV", "台球厅", "健身房", "公交站", "地铁站"];
  const center = { query: "深圳北站", formattedAddress: "深圳市龙华区致远中路", province: "广东省", city: "深圳市", district: "龙华区", level: "交通设施", longitude: 114.029, latitude: 22.609 };
  const location = { id: "fixture-center", name: "深圳北站", address: center.formattedAddress, city: center.city, district: center.district, placeType: "交通设施", location: { longitude: center.longitude, latitude: center.latitude } };
  function places(key, count, offset = 0) {
    return Array.from({ length: count }, (_, index) => ({
      id: `${key}-${index + offset}`, parentId: null, name: `示例${labels[keys.indexOf(key)]} ${index + offset + 1}`,
      category: key, longitude: center.longitude, latitude: center.latitude, distanceMeters: 350 + (index + offset) * 31,
      distanceSource: "amap", amapDistanceMeters: 350 + (index + offset) * 31, computedDistanceMeters: 350 + (index + offset) * 31,
      type: null, typecode: null, cost: 85 + index, rating: 4 + index / 100, tag: "示例数据",
      openTimeToday: "10:00–22:00", openTimeWeek: null, address: "深圳市龙华区 · 示例地址",
    }));
  }
  function result(key, status = "success", count = 25) {
    return { category: { key, label: labels[keys.indexOf(key)] }, status, places: status === "success" ? places(key, count) : [],
      page: status === "success" || status === "empty" ? { pageNumber: 1, pageSize: 25, returnedCount: status === "success" ? count : 0, mayHaveNextApiPage: count === 25 && status === "success" } : null,
      error: status === "error" ? { message: "该类别暂时无法搜索，请稍后再试", info: null, infocode: null } : null };
  }
  const fixture = window.__categoryFixture = { calls: [], cancelled: 0, historySaves: 0, failPage: false, push: null, finish: null, breakStream: null };
  window.fetch = async (input, init = {}) => {
    const url = String(input); fixture.calls.push(url);
    const request = init.body ? JSON.parse(init.body) : {};
    if (url === "/api/resolve-location") return Response.json({ status: "confirmed", location });
    if (url.startsWith("/api/history")) {
      if (init.method === "POST") { fixture.historySaves++; return Response.json({ item: { ...request, id: "fixture-history", searchedAt: new Date().toISOString() } }); }
      return Response.json({ items: [], hasMore: false });
    }
    if (url === "/api/search/page") {
      if (fixture.failPage) { fixture.failPage = false; return Response.json({ error: { message: "模拟分页失败，请重试" } }, { status: 503 }); }
      return Response.json({ categoryId: request.categoryId, page: { places: places(request.categoryId, 25, 25), pageNumber: 2, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: true } });
    }
    if (url === "/api/search") {
      const selected = request.categoryIds;
      const results = new Map(); let controller; let closed = false;
      const send = event => { if (!closed) controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n")); };
      const progress = () => send({ type: "progress", progress: { results: selected.filter(key => results.has(key)).map(key => results.get(key)), active: selected.filter(key => !results.has(key)).slice(0, 2), pending: selected.filter(key => !results.has(key)).slice(2) } });
      const stream = new ReadableStream({ start(value) { controller = value; progress(); }, cancel() { closed = true; } });
      init.signal?.addEventListener("abort", () => { fixture.cancelled++; if (!closed) { closed = true; controller.close(); } }, { once: true });
      fixture.push = (key, status = "success", count = 25) => { results.set(key, result(key, status, count)); progress(); };
      fixture.finish = () => {
        if (closed) return;
        for (const key of selected) if (!results.has(key)) results.set(key, result(key, key === "bakery" ? "empty" : key === "dessert" ? "error" : "success", 5));
        send({ type: "complete", response: { resolvedLocation: center, categories: selected.map(key => results.get(key)), status: "partial success" } });
        closed = true; controller.close();
      };
      fixture.breakStream = () => { closed = true; controller.close(); };
      return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
    }
    throw new Error(`Unexpected fixture URL: ${url}`);
  };
}
