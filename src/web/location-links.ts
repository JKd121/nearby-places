const AMAP_MARKER_URL = "https://uri.amap.com/marker";

export interface AmapMarkerPlace {
  longitude: number;
  latitude: number;
  name: string;
  id?: string;
  preferPoiId?: boolean;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

/** Build a key-free HTTPS AMap marker URI from an existing POI coordinate. */
export function buildAmapMarkerUrl(place: AmapMarkerPlace): string | null {
  if (!isValidLongitude(place.longitude) || !isValidLatitude(place.latitude)) return null;

  const url = new URL(AMAP_MARKER_URL);
  const params = new URLSearchParams({
    position: `${place.longitude},${place.latitude}`,
    name: place.name,
    src: "place-aggregator",
    coordinate: "gaode",
    callnative: "0",
  });
  if (place.preferPoiId && place.id?.trim()) params.set("poiid", place.id.trim());
  url.search = params.toString();
  return url.toString();
}
