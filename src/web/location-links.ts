const AMAP_MARKER_URL = "https://uri.amap.com/marker";

export interface AmapMarkerPlace {
  longitude: number;
  latitude: number;
  name: string;
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
  url.search = new URLSearchParams({
    position: `${place.longitude},${place.latitude}`,
    name: place.name,
    src: "place-aggregator",
    coordinate: "gaode",
    callnative: "0",
  }).toString();
  return url.toString();
}
