// Deliberately exclude error objects, response bodies and captured stdout.
// Each test name describes the contract asserted by that scenario.
export default async function* report(events) {
  const cases = [];
  const requests = [];
  for await (const event of events) {
    if (event.type === "test:diagnostic" && event.data.message.startsWith("contract ")) {
      const { endpoint, status, upstreamCalls } = JSON.parse(event.data.message.slice(9));
      requests.push({ endpoint, status, upstreamCalls });
    }
    if (event.type === "test:pass" || event.type === "test:fail") {
      cases.push({ assertion: event.data.name, status: event.type === "test:pass" ? "passed" : "failed",
        file: event.data.file?.replaceAll("\\", "/").split("/dist/").at(-1),
        durationMs: event.data.details?.duration_ms });
    }
  }
  yield JSON.stringify({ schemaVersion: 1, cases, requests, failed: cases.filter(item => item.status === "failed").length }, null, 2);
}
