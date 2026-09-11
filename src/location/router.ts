import type { LocationIntent } from "./types.js";

const STREET_SIGNAL = /(路|街道?|大道|巷|弄)/u;
const DOORPLATE_SIGNAL = /\d+\s*(号|號|室|楼|樓|层|層|座|栋|棟)/u;
const EXPLICIT_ADDRESS_SIGNAL = /(门牌|門牌|邮编|郵編|邮政编码|郵政編碼)/u;

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function hasStrongAddressEvidence(value: string): boolean {
  return EXPLICIT_ADDRESS_SIGNAL.test(value) || (STREET_SIGNAL.test(value) && DOORPLATE_SIGNAL.test(value));
}

/**
 * Conservative first-pass routing. Strong street/doorplate evidence wins;
 * everything else remains a place query so an ambiguous name can be confirmed.
 */
export function routeLocationQuery(query: string): LocationIntent {
  const rawQuery = collapseWhitespace(query);
  return { rawQuery, kind: hasStrongAddressEvidence(rawQuery) ? "ADDRESS_QUERY" : "PLACE_QUERY" };
}
