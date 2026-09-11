import type { GeocodedPlace } from "../amap/types.js";
import type { LocationCandidate, ProviderPlace } from "./types.js";

const TYPE_LABELS: readonly [RegExp, string][] = [
  [/火车站|铁路车站/u, "火车站"],
  [/地铁站|轨道交通车站/u, "地铁站"],
  [/公交站|公交车站/u, "公交站"],
  [/机场/u, "机场"],
  [/酒店|宾馆|旅馆|客栈|住宿/u, "酒店"],
  [/大学|学院|高等院校|学校/u, "学校"],
  [/商场|购物中心|百货大楼/u, "商场"],
  [/火锅/u, "火锅"],
  [/面包|烘焙/u, "面包烘焙"],
  [/甜品|糖水|甜点/u, "甜品"],
  [/KTV|卡拉OK|量贩式KTV/iu, "KTV"],
  [/台球|桌球/u, "台球厅"],
  [/健身|体育馆|瑜伽/u, "健身房"],
];

/** Maps common AMap type paths to a short user-facing label. */
export function normalizePlaceType(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const segments = value.split(/[;；]/u).map((segment) => segment.trim()).filter(Boolean);
  for (const segment of segments) {
    for (const [pattern, label] of TYPE_LABELS) {
      if (pattern.test(segment)) return label;
    }
  }
  return null;
}

export function normalizePoiCandidates(values: readonly ProviderPlace[]): LocationCandidate[] {
  return values.flatMap((value): LocationCandidate[] => {
    if (!value.location) return [];
    return [{
      id: value.id,
      name: value.name?.trim() || "未命名地点",
      placeType: normalizePlaceType(value.type),
      city: value.city,
      district: value.district,
      address: value.address,
      location: value.location,
    }];
  });
}

export function normalizeGeocodeCandidate(value: GeocodedPlace): LocationCandidate {
  return {
    id: null,
    name: value.formattedAddress || "未命名地址",
    placeType: normalizePlaceType(value.level) ?? "门址",
    city: value.city,
    district: value.district,
    address: value.formattedAddress || null,
    location: { longitude: value.longitude, latitude: value.latitude },
  };
}
