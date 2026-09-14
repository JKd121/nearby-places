import { CATEGORIES } from "../../src/amap/categories.js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo";
const AROUND_URL = "https://restapi.amap.com/v5/place/around";
const INTERVAL_MS = 500;
const PAGE_SIZE = 25;

type RecordLike = Record<string, unknown>;
type Sample = { id: "shenzhen" | "hong-kong"; query: string; location: { longitude: number; latitude: number } | null };
type JsonRequester = (url: URL) => Promise<RecordLike>;
type PhotoUrlClassification = { kind: "https" | "http" | "invalid" | "malformed"; host: string | null };
type PhaseBSample = { location: Sample["id"]; category: string; poiName: string; sampleIndex: number; photoUrl: string };

export type PhaseBPhotoEvidence = {
  totalPhotoObjects: number;
  httpsPhotoUrlCount: number;
  nonHttpsPhotoUrlCount: number;
  malformedUrlCount: number;
  invalidUrlCount: number;
  hostDistribution: Record<string, number>;
  selected: PhaseBSample[];
};

function isRecord(value: unknown): value is RecordLike { return typeof value === "object" && value !== null && !Array.isArray(value); }
function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() !== "" ? value : null; }
function parseLocation(value: unknown): { longitude: number; latitude: number } | null {
  if (typeof value !== "string") return null;
  const [longitudeText, latitudeText] = value.split(",");
  if (longitudeText === undefined || latitudeText === undefined) return null;
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : null;
}
function parsePhotos(value: unknown): Array<{ title: string | null; url: string | null }> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((photo) => ({ title: stringValue(photo.title), url: stringValue(photo.url) }));
}
function parsePhotoEntries(value: unknown): Array<{ title: string | null; rawUrl: unknown }> {
  if (!Array.isArray(value)) return [];
  return value.map((photo) => isRecord(photo) ? { title: stringValue(photo.title), rawUrl: photo.url } : { title: null, rawUrl: null });
}
function safeError(payload: unknown): { info: string | null; infocode: string | null } {
  if (!isRecord(payload)) return { info: null, infocode: null };
  return { info: stringValue(payload.info), infocode: stringValue(payload.infocode) };
}
function protocolOf(url: string | null): "https" | "http" | "other" | null {
  if (!url) return null;
  try { const protocol = new URL(url).protocol; return protocol === "https:" ? "https" : protocol === "http:" ? "http" : "other"; } catch { return "other"; }
}
export function classifyPhotoUrl(value: unknown): PhotoUrlClassification {
  if (typeof value !== "string" || value.trim() === "") return { kind: "malformed", host: null };
  try {
    const parsed = new URL(value);
    const host = parsed.hostname || null;
    if (parsed.protocol === "https:") return { kind: "https", host };
    if (parsed.protocol === "http:") return { kind: "http", host };
    return { kind: "invalid", host };
  } catch {
    return { kind: "malformed", host: null };
  }
}

export function selectPhaseBSamples(
  pois: readonly RecordLike[],
  location: Sample["id"],
  category: string
): PhaseBPhotoEvidence {
  const evidence: PhaseBPhotoEvidence = {
    totalPhotoObjects: 0,
    httpsPhotoUrlCount: 0,
    nonHttpsPhotoUrlCount: 0,
    malformedUrlCount: 0,
    invalidUrlCount: 0,
    hostDistribution: {},
    selected: []
  };
  for (const poi of pois) {
    const entries = parsePhotoEntries(poi.photos);
    evidence.totalPhotoObjects += entries.length;
    let firstHttps: string | null = null;
    for (const entry of entries) {
      const classification = classifyPhotoUrl(entry.rawUrl);
      if (classification.host) evidence.hostDistribution[classification.host] = (evidence.hostDistribution[classification.host] ?? 0) + 1;
      if (classification.kind === "https") {
        evidence.httpsPhotoUrlCount += 1;
        if (firstHttps === null && typeof entry.rawUrl === "string") firstHttps = entry.rawUrl;
      } else if (classification.kind === "http") {
        evidence.nonHttpsPhotoUrlCount += 1;
      } else if (classification.kind === "malformed") {
        evidence.malformedUrlCount += 1;
      } else {
        evidence.invalidUrlCount += 1;
      }
    }
    if (firstHttps !== null && evidence.selected.length < 2) {
      evidence.selected.push({
        location,
        category,
        poiName: stringValue(poi.name) ?? "(unnamed)",
        sampleIndex: evidence.selected.length + 1,
        photoUrl: firstHttps
      });
    }
  }
  return evidence;
}

type ReviewValue = { classification: string; reason: string };

export function buildReviewExport(samples: readonly PhaseBSample[], values: readonly ReviewValue[]): Array<Record<string, unknown>> {
  return samples.map((sample, index) => ({
    location: sample.location,
    category: sample.category,
    poiName: sample.poiName,
    sampleIndex: sample.sampleIndex,
    classification: values[index]?.classification ?? "",
    reason: values[index]?.reason ?? ""
  }));
}
async function getJson(url: URL): Promise<RecordLike> {
  const response = await fetch(url);
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload) || payload.status !== "1") {
    const error = safeError(payload);
    throw new Error(`provider request failed: ${error.info ?? `HTTP ${response.status}`} (${error.infocode ?? "no-infocode"})`);
  }
  return payload;
}
async function geocode(key: string, query: string, request: JsonRequester = getJson): Promise<Sample["location"]> {
  const url = new URL(GEOCODE_URL);
  url.search = new URLSearchParams({ key, address: query, output: "JSON" }).toString();
  const payload = await request(url);
  const first = Array.isArray(payload.geocodes) && isRecord(payload.geocodes[0]) ? payload.geocodes[0] : null;
  return first ? parseLocation(first.location) : null;
}
function buildAroundUrl(key: string, sample: Sample, category: typeof CATEGORIES[number], showFields: string): URL {
  if (!sample.location) throw new Error("sample has no geocode location");
  const params = new URLSearchParams({ key, location: `${sample.location.longitude},${sample.location.latitude}`, radius: "3000", sortrule: "distance", show_fields: showFields, page_size: String(PAGE_SIZE), page_num: "1", types: category.types.join("|") });
  const url = new URL(AROUND_URL);
  url.search = params.toString();
  return url;
}
async function fetchAround(key: string, sample: Sample, category: typeof CATEGORIES[number], request: JsonRequester, showFields: string): Promise<RecordLike> {
  return request(buildAroundUrl(key, sample, category, showFields));
}
async function around(key: string, sample: Sample, category: typeof CATEGORIES[number], request: JsonRequester = getJson, showFields = "business,navi,photos"): Promise<void> {
  if (!sample.location) { console.log(`${sample.id} ${category.key}: skipped (no geocode location)`); return; }
  try {
    const payload = await fetchAround(key, sample, category, request, showFields);
    const pois = Array.isArray(payload.pois) ? payload.pois.filter(isRecord) : [];
    const rows = pois.map((poi) => {
      const photos = parsePhotos(poi.photos);
      const usable = photos.find((photo) => photo.url !== null);
      return { name: stringValue(poi.name) ?? "(unnamed)", type: stringValue(poi.type), typecode: stringValue(poi.typecode), photoCount: photos.length, firstPhotoProtocol: protocolOf(usable?.url ?? null), hasHttpsPhoto: photos.some((photo) => protocolOf(photo.url) === "https"), photoUrlsUsableDirectly: Boolean(usable?.url) };
    });
    console.log(JSON.stringify({ sample: sample.id, category: category.key, requestedTypes: category.types, returned: rows.length, withPhotos: rows.filter((row) => row.photoCount > 0).length, rows }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ sample: sample.id, category: category.key, requestedTypes: category.types, status: "error", message: error instanceof Error ? error.message : String(error) }));
  }
}
async function delay(): Promise<void> { await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS)); }

function createSerialRequester(intervalMs: number): { request: JsonRequester; getRequestCount: () => number } {
  let requestCount = 0;
  return {
    request: async (url) => {
      if (requestCount > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
      requestCount += 1;
      return getJson(url);
    },
    getRequestCount: () => requestCount
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function renderPhaseBReviewHtml(samples: readonly PhaseBSample[]): string {
  const options = ["", "RELEVANT", "ACCEPTABLE_WEAK", "IRRELEVANT", "UNUSABLE"].map((value) => `<option value="${value}">${value || "UNREVIEWED"}</option>`).join("");
  const cards = samples.length === 0 ? "<p>No HTTPS-eligible samples were selected.</p>" : samples.map((sample) => `<article data-location="${escapeHtml(sample.location)}" data-category="${escapeHtml(sample.category)}" data-poi-name="${escapeHtml(sample.poiName)}" data-sample-index="${sample.sampleIndex}"><img src="${escapeHtml(sample.photoUrl)}" alt="${escapeHtml(sample.poiName)}"><div><strong>${escapeHtml(sample.location)} / ${escapeHtml(sample.category)} / ${escapeHtml(sample.poiName)}</strong><p>sample index: ${sample.sampleIndex}</p><label>classification <select class="classification">${options}</select></label><label>short reason <input class="reason" type="text" maxlength="240" placeholder="Optional reviewer note"></label></div></article>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nearby Places Phase B Photo Review</title><style>body{font:14px system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;background:#f5f7f8;color:#17232b}header{position:sticky;top:0;z-index:1;background:#f5f7f8;padding:8px 0 12px}header strong{margin-right:16px}button,select,input{font:inherit}button{padding:8px 12px;border:1px solid #c5d3d8;border-radius:8px;background:#fff;cursor:pointer}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #147f95;outline-offset:2px}article{display:grid;grid-template-columns:minmax(180px,280px) 1fr;gap:16px;background:#fff;border:1px solid #dce5e8;border-radius:12px;padding:12px;margin:12px 0}img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:#eef2f3}label{display:block;margin-top:10px}select,input{display:block;width:100%;max-width:420px;margin-top:4px;padding:6px;border:1px solid #c5d3d8;border-radius:6px;box-sizing:border-box}@media(max-width:640px){article{grid-template-columns:1fr}}</style></head><body><header><strong id="progress">Reviewed: 0 / ${samples.length}</strong><span id="counts">RELEVANT 0 · ACCEPTABLE_WEAK 0 · IRRELEVANT 0 · UNUSABLE 0</span><button id="export" type="button">Export review results</button><span id="export-status" role="status" aria-live="polite"></span></header><h1>Phase B bounded photo review</h1><p>Inspect only the first valid HTTPS photo selected by the deterministic harness. This temporary file is for local review only.</p>${cards}<script>(()=>{const cards=[...document.querySelectorAll('article')];const classifications=['RELEVANT','ACCEPTABLE_WEAK','IRRELEVANT','UNUSABLE'];const progress=document.getElementById('progress');const counts=document.getElementById('counts');const status=document.getElementById('export-status');const update=()=>{const values=cards.map(card=>card.querySelector('select')?.value||'');const reviewed=values.filter(Boolean).length;const count=Object.fromEntries(classifications.map(value=>[value,values.filter(item=>item===value).length]));progress.textContent='Reviewed: '+reviewed+' / '+cards.length;counts.textContent=classifications.map(value=>value+' '+count[value]).join(' · ');};cards.forEach(card=>{const select=card.querySelector('select');if(select&&!select.querySelector('option[value=""]')){const option=document.createElement('option');option.value='';option.textContent='UNREVIEWED';select.prepend(option);}select?.addEventListener('change',update);card.querySelector('input')?.addEventListener('input',update);});document.getElementById('export')?.addEventListener('click',()=>{const payload=cards.map(card=>({location:card.dataset.location||'',category:card.dataset.category||'',poiName:card.dataset.poiName||'',sampleIndex:Number(card.dataset.sampleIndex||0),classification:card.querySelector('select')?.value||'',reason:card.querySelector('input')?.value||''}));const blob=new Blob([JSON.stringify(payload,null,2)+'\\n'],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='phase-b-review-results.json';link.click();URL.revokeObjectURL(url);const reviewed=payload.filter(item=>item.classification).length;status.textContent='Exported '+reviewed+' / '+payload.length+' reviewed items'+(reviewed<payload.length?' (partial)':'')+'.';});update();})();</script></body></html>`;
}

function buildReviewTemplate(samples: readonly PhaseBSample[]): string {
  return JSON.stringify({ reviewVersion: "v0.2B-2-phase-b", items: samples.map((sample) => ({ location: sample.location, category: sample.category, poiName: sample.poiName, sampleIndex: sample.sampleIndex, classification: "", reason: "" })) }, null, 2) + "\n";
}

async function runPhaseB(key: string): Promise<void> {
  const requester = createSerialRequester(INTERVAL_MS);
  const anchors: Array<{ id: Sample["id"]; query: string }> = [
    { id: "shenzhen", query: "深圳市龙华区民治街道北站社区致远中路28号" },
    { id: "hong-kong", query: "香港特别行政区九龙塘达之路83号" }
  ];
  const samples: Sample[] = [];
  const selected: PhaseBSample[] = [];
  const totals = { totalPhotoObjects: 0, httpsPhotoUrlCount: 0, nonHttpsPhotoUrlCount: 0, malformedUrlCount: 0, invalidUrlCount: 0, hostDistribution: {} as Record<string, number> };
  const categoryEvidence: Array<Record<string, unknown>> = [];
  for (const anchor of anchors) {
    let location: Sample["location"] = null;
    try {
      location = await geocode(key, anchor.query, requester.request);
    } catch (error) {
      console.log(JSON.stringify({ phase: "phase-b", sample: anchor.id, stage: "geocode", status: "error", message: error instanceof Error ? error.message : String(error) }));
    }
    samples.push({ id: anchor.id, query: anchor.query, location });
  }
  for (const sample of samples) {
    for (const category of CATEGORIES) {
      if (!sample.location) {
        categoryEvidence.push({ sample: sample.id, category: category.key, status: "skipped", reason: "no geocode location" });
        continue;
      }
      try {
        const payload = await fetchAround(key, sample, category, requester.request, "business,photos");
        const pois = Array.isArray(payload.pois) ? payload.pois.filter(isRecord) : [];
        const evidence = selectPhaseBSamples(pois, sample.id, category.key);
        selected.push(...evidence.selected);
        totals.totalPhotoObjects += evidence.totalPhotoObjects;
        totals.httpsPhotoUrlCount += evidence.httpsPhotoUrlCount;
        totals.nonHttpsPhotoUrlCount += evidence.nonHttpsPhotoUrlCount;
        totals.malformedUrlCount += evidence.malformedUrlCount;
        totals.invalidUrlCount += evidence.invalidUrlCount;
        for (const [host, count] of Object.entries(evidence.hostDistribution)) totals.hostDistribution[host] = (totals.hostDistribution[host] ?? 0) + count;
        categoryEvidence.push({ sample: sample.id, category: category.key, returned: pois.length, selected: evidence.selected.length, totalPhotoObjects: evidence.totalPhotoObjects, httpsPhotoUrlCount: evidence.httpsPhotoUrlCount, nonHttpsPhotoUrlCount: evidence.nonHttpsPhotoUrlCount, malformedUrlCount: evidence.malformedUrlCount, invalidUrlCount: evidence.invalidUrlCount });
      } catch (error) {
        categoryEvidence.push({ sample: sample.id, category: category.key, status: "error", message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  const reviewDir = await mkdtemp(join(tmpdir(), "nearby-places-photo-review-"));
  await writeFile(join(reviewDir, "review.html"), renderPhaseBReviewHtml(selected), "utf8");
  await writeFile(join(reviewDir, "review-results.template.json"), buildReviewTemplate(selected), "utf8");
  await writeFile(join(reviewDir, "safe-summary.json"), JSON.stringify({ phase: "v0.2B-2-phase-b", categoryEvidence, totals, selectedSampleCount: selected.length, maxSampleCount: 32 }, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ phase: "v0.2B-2-phase-b", requestCount: requester.getRequestCount(), selectedSampleCount: selected.length, maxSampleCount: 32, safeSummary: { ...totals, categoryEvidence }, reviewHtmlPath: join(reviewDir, "review.html"), reviewResultsTemplatePath: join(reviewDir, "review-results.template.json"), cleanup: `Remove-Item -LiteralPath '${reviewDir}' -Recurse -Force` }, null, 2));
}

async function main(): Promise<void> {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key?.trim()) { console.error("AMAP_WEB_SERVICE_KEY is absent; photo enrichment Spike stopped before any AMap request."); process.exitCode = 2; return; }
  if (process.argv.includes("--phase-b")) {
    await runPhaseB(key);
    return;
  }
  const samples: Sample[] = [
    { id: "shenzhen", query: "深圳北站", location: await geocode(key, "深圳北站") },
    { id: "hong-kong", query: "香港特别行政区九龙达之路香港城市大学", location: await geocode(key, "香港特别行政区九龙达之路香港城市大学") }
  ];
  for (const sample of samples) {
    for (const [index, category] of CATEGORIES.entries()) {
      await around(key, sample, category);
      if (index < CATEGORIES.length - 1) await delay();
    }
  }
}

const isMainModule = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMainModule) await main();
