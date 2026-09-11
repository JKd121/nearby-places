import { CATEGORIES } from "../src/amap/categories.js";
import { createAmapClient } from "../src/amap/client.js";
import { searchCategoriesForSmoke, validateGeocodeForSmoke } from "../src/amap/smoke.js";
import type { CategorySearchResult, GeocodedPlace, Place, SearchStrategy } from "../src/amap/types.js";

const DEFAULT_PLACES = ["深圳北站", "香港特别行政区九龙达之路香港城市大学"];
const SEARCH_RADIUS_METERS = 3_000;
const DISPLAY_LIMIT = 10;
const FINAL_EXPERIMENT_KEYS = new Set(["hotel", "gym", "dessert"]);
const FINAL_EXPERIMENT_CATEGORIES = CATEGORIES.filter((category) => FINAL_EXPERIMENT_KEYS.has(category.key));

function printGeocode(centre: GeocodedPlace): void {
  console.log("geocode: API success");
  console.log(`matched: ${centre.formattedAddress || "null"}`);
  console.log(`province: ${centre.province ?? "null"}`);
  console.log(`city: ${centre.city ?? "null"}`);
  console.log(`district: ${centre.district ?? "null"}`);
  console.log(`location: ${centre.longitude},${centre.latitude}`);
  console.log(`level: ${centre.level ?? "null"}`);
}

function printPlace(place: Place, index: number): void {
  const difference = place.amapDistanceMeters === null ? null : Math.abs(place.amapDistanceMeters - place.computedDistanceMeters);
  console.log(`${index + 1}. ${place.name}`);
  console.log(`   type: ${place.type ?? "null"}`);
  console.log(`   typecode: ${place.typecode ?? "null"}`);
  console.log(`   distance: ${place.distanceMeters}m (source=${place.distanceSource})`);
  console.log(`   native/computed/difference: ${place.amapDistanceMeters ?? "null"}/${place.computedDistanceMeters}/${difference ?? "null"}m`);
  console.log(`   cost/rating/tag: ${place.cost ?? "null"}/${place.rating ?? "null"}/${place.tag ?? "null"}`);
  console.log(`   address: ${place.address}`);
}

function printCategory(result: CategorySearchResult, strategy: SearchStrategy): void {
  console.log(`${result.category.label} [strategy=${strategy}; requested types=${strategy === "keyword-only" ? "null" : result.category.types.join("|")}; keyword=${strategy === "types-only" ? "null" : result.category.keyword}]`);
  if (result.error) {
    console.log(`search failed: ${result.error.message}; info=${result.error.info ?? "null"}; infocode=${result.error.infocode ?? "null"}\n`);
    return;
  }
  console.log(`returned: ${result.places.length}; status=${result.status}; mayHaveNextApiPage=${result.page?.mayHaveNextApiPage ?? false}`);
  result.places.slice(0, DISPLAY_LIMIT).forEach(printPlace);
  console.log();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function printDistanceSummary(label: string, results: CategorySearchResult[]): void {
  const places = results.flatMap((result) => result.places);
  const differences = places.flatMap((place) => place.amapDistanceMeters === null ? [] : [Math.abs(place.amapDistanceMeters - place.computedDistanceMeters)]);
  const coverage = places.length === 0 ? 0 : differences.length / places.length * 100;
  console.log(`${label} native distance: ${differences.length}/${places.length} (${coverage.toFixed(1)}%); median difference=${median(differences) ?? "null"}m; max difference=${differences.length > 0 ? Math.max(...differences) : "null"}m`);
}

async function runStrategy(
  centre: GeocodedPlace,
  client: ReturnType<typeof createAmapClient>,
  strategy: SearchStrategy,
  categories = CATEGORIES
): Promise<CategorySearchResult[]> {
  const outcome = await searchCategoriesForSmoke(
    centre,
    categories,
    (location, category, options) => client.searchNearby(location, category, { ...options, strategy }),
    SEARCH_RADIUS_METERS
  );
  if (outcome.validationError) throw new Error(`geocode validation failure: ${outcome.validationError}`);
  return outcome.results;
}

async function main(): Promise<void> {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key?.trim()) throw new Error("Missing AMAP_WEB_SERVICE_KEY. Set it in the process environment before running the smoke test.");
  const client = createAmapClient(key);
  const queries = process.argv.slice(2);
  const placeNames = queries.length > 0 ? queries : DEFAULT_PLACES;

  console.log("v0.1A quality comparison: keyword-only baseline vs types-only candidate.");
  console.log("distanceMeters uses valid AMap native distance, with a locally computed Haversine fallback; both values are shown.\n");
  for (const placeName of placeNames) {
    console.log(`========== ${placeName} ==========`);
    let centre: GeocodedPlace;
    try { centre = await client.geocode(placeName); printGeocode(centre); }
    catch (error) {
      const info = error && typeof error === "object" && "info" in error ? String((error as { info?: unknown }).info ?? "null") : "null";
      const infocode = error && typeof error === "object" && "infocode" in error ? String((error as { infocode?: unknown }).infocode ?? "null") : "null";
      console.error(`geocode API failure: ${error instanceof Error ? error.message : String(error)}; info=${info}; infocode=${infocode}\n`);
      continue;
    }
    const validationError = validateGeocodeForSmoke(centre);
    if (validationError) { console.error(`geocode validation failure: ${validationError}\n`); continue; }
    console.log("geocode validation: passed\n");

    const baseline = await runStrategy(centre, client, "keyword-only");
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    const candidate = await runStrategy(centre, client, "types-only");
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    const finalExperiment = await runStrategy(centre, client, "keyword-and-types", FINAL_EXPERIMENT_CATEGORIES);
    console.log("--- keyword-only baseline ---");
    baseline.forEach((result) => printCategory(result, "keyword-only"));
    console.log("--- types-only candidate ---");
    candidate.forEach((result) => printCategory(result, "types-only"));
    console.log("--- keyword-and-types final experiment (hotel/gym/dessert only) ---");
    finalExperiment.forEach((result) => printCategory(result, "keyword-and-types"));
    console.log("comparison counts (baseline -> candidate)");
    for (let index = 0; index < CATEGORIES.length; index += 1) {
      console.log(`${CATEGORIES[index]!.label}: ${baseline[index]?.places.length ?? 0} -> ${candidate[index]?.places.length ?? 0}`);
    }
    console.log("final experiment counts (keyword-only -> types-only -> keyword-and-types)");
    for (const category of FINAL_EXPERIMENT_CATEGORIES) {
      const baselineResult = baseline.find((result) => result.category.key === category.key);
      const candidateResult = candidate.find((result) => result.category.key === category.key);
      const hybridResult = finalExperiment.find((result) => result.category.key === category.key);
      console.log(`${category.label}: ${baselineResult?.places.length ?? 0} -> ${candidateResult?.places.length ?? 0} -> ${hybridResult?.places.length ?? 0}`);
    }
    printDistanceSummary("baseline", baseline);
    printDistanceSummary("candidate", candidate);
    console.log();
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
