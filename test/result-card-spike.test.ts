import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewExport, classifyPhotoUrl, selectPhaseBSamples } from "../scripts/spikes/result-card-enrichment-spike.js";

test("photo URL classification only treats HTTPS as eligible", () => {
  assert.deepEqual(classifyPhotoUrl("https://img.example.test/a"), { kind: "https", host: "img.example.test" });
  assert.deepEqual(classifyPhotoUrl("http://img.example.test/a"), { kind: "http", host: "img.example.test" });
  assert.deepEqual(classifyPhotoUrl("ftp://img.example.test/a"), { kind: "invalid", host: "img.example.test" });
  assert.deepEqual(classifyPhotoUrl("not-a-url"), { kind: "malformed", host: null });
});

test("phase B sampling selects the first two HTTPS-eligible POIs deterministically", () => {
  const evidence = selectPhaseBSamples([
    { name: "HTTP only", photos: [{ url: "http://img.example.test/one" }] },
    { name: "First HTTPS", photos: [{ url: "https://img.example.test/two" }, { url: "https://img.example.test/three" }] },
    { name: "Malformed then HTTPS", photos: [{ url: "not-a-url" }, { url: "https://cdn.example.test/four" }] },
    { name: "Later HTTPS", photos: [{ url: "https://later.example.test/five" }] }
  ], "shenzhen", "hotel");

  assert.equal(evidence.totalPhotoObjects, 6);
  assert.equal(evidence.httpsPhotoUrlCount, 4);
  assert.equal(evidence.nonHttpsPhotoUrlCount, 1);
  assert.equal(evidence.malformedUrlCount, 1);
  assert.equal(evidence.invalidUrlCount, 0);
  assert.deepEqual(evidence.selected.map((sample) => [sample.poiName, sample.sampleIndex]), [["First HTTPS", 1], ["Malformed then HTTPS", 2]]);
  assert.deepEqual(evidence.hostDistribution, { "img.example.test": 3, "cdn.example.test": 1, "later.example.test": 1 });
});

test("review export contains only review metadata and never photo URLs", () => {
  const samples = selectPhaseBSamples([{ name: "Example", photos: [{ url: "https://img.example.test/photo" }] }], "hong-kong", "hotel").selected;
  const exported = buildReviewExport(samples, [{ classification: "RELEVANT", reason: "related" }]);
  assert.deepEqual(exported, [{ location: "hong-kong", category: "hotel", poiName: "Example", sampleIndex: 1, classification: "RELEVANT", reason: "related" }]);
  assert.equal(JSON.stringify(exported).includes("photo"), false);
});
