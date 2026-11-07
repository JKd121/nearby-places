// Test-process injection only. Production modules never import this file.
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
  if (url.hostname !== "restapi.amap.com") return original(input, init);
  const key = url.searchParams.get("key");
  if (key === "c".repeat(32)) return Response.json({ status: "0", infocode: "10001" });
  if (key === "d".repeat(32)) return Response.json({ status: "0", infocode: "10003" });
  if (key === "e".repeat(32)) return Response.json({ status: "0", infocode: "10021" });
  return Response.json({ status: "1", count: "1",
    geocodes: [{ formatted_address: "深圳市龙华区深圳北站", province: "广东省", city: "深圳市", district: "龙华区", level: "兴趣点", location: "114.03,22.61" }],
    pois: [{ id: "fixture-poi", name: "测试地点", type: "生活服务", typecode: "060000", address: "测试地址", location: "114.03,22.61", cityname: "深圳市", adname: "龙华区", distance: "20" }],
  });
};
