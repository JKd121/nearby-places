import type { MapPlace } from "./model.js";

export type LngLat = [number, number];
export interface MapPixel { x: number; y: number; }
export interface MapMarker {
  setMap(map: MapInstance | null): void; setPosition(position: LngLat): void;
  setContent(content: HTMLElement | string): void; setOffset(offset: MapPixel): void;
}
export interface MapCircle { setCenter(center: LngLat): void; setRadius(radius: number): void; getBounds(): unknown; }
export interface MapInstance {
  on(event: string, callback: () => void): void; off(event: string, callback: () => void): void;
  add(overlay: unknown): void; remove(overlay: unknown): void;
  getSize(): { width: number; height: number }; getZoom(): number;
  getCenter(): { lng: number; lat: number };
  lngLatToContainer(position: LngLat): MapPixel;
  setZoomAndCenter(zoom: number, center: LngLat): void; panTo(center: LngLat): void;
  setBounds(bounds: unknown, immediately?: boolean, padding?: number[]): void;
  getFitZoomAndCenterByBounds(bounds: unknown, padding?: number[]): [number, { lng: number; lat: number }];
  resize(): void; destroy(): void;
}
export interface ClusterDatum { lnglat: LngLat; point: MapPlace; }
export interface ClusterContext { marker: MapMarker; clusterData?: ClusterDatum[]; data?: ClusterDatum[]; count?: number; }
export interface MapCluster { setData(data: ClusterDatum[]): void; setGridSize(size: number): void; setMap(map: MapInstance | null): void; }
export interface AmapSdk {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: Record<string, unknown>) => MapMarker;
  Circle: new (options: Record<string, unknown>) => MapCircle;
  Pixel: new (x: number, y: number) => MapPixel;
  Bounds: new (southWest: LngLat, northEast: LngLat) => unknown;
  MarkerCluster: new (map: MapInstance, points: ClusterDatum[], options: {
    gridSize: number; maxZoom: number; zoomOnClick: boolean; clusterByZoomChange: boolean;
    renderMarker: (context: ClusterContext) => void; renderClusterMarker: (context: ClusterContext) => void;
  }) => MapCluster;
}

declare global {
  interface Window { AMap?: AmapSdk; _AMapSecurityConfig?: { serviceHost: string }; }
}

let pending: Promise<AmapSdk> | null = null;
/** Shared script, independently cancellable consumers. A failed load can be retried. */
export function loadMapSdk(sessionId: string | undefined, signal: AbortSignal): Promise<AmapSdk> {
  if (!pending) {
    pending = (async () => {
      const response = await fetch("/api/maps/config", { cache: "no-store", signal: AbortSignal.timeout(8000), headers: sessionId ? { "x-nearby-session": sessionId } : {} });
      const config = await response.json() as { key?: string; serviceHost?: string; error?: { message?: string } };
      if (!response.ok || !config.key || !config.serviceHost) throw new Error(config.error?.message ?? "地图配置暂不可用");
      if (window.AMap?.MarkerCluster) return window.AMap;
      window._AMapSecurityConfig = { serviceHost: location.origin + config.serviceHost };
      return await new Promise<AmapSdk>((resolve, reject) => {
        const script = document.createElement("script");
        const timer = window.setTimeout(() => finish(new Error("地图加载超时，请重试")), 15000);
        function finish(error?: Error) {
          clearTimeout(timer); script.onload = null; script.onerror = null;
          if (error) { script.remove(); reject(error); }
          else if (window.AMap?.MarkerCluster) resolve(window.AMap);
          else { script.remove(); reject(new Error("地图组件加载失败，请重试")); }
        }
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.key!)}&plugin=AMap.MarkerCluster`;
        script.async = true; script.dataset.nearbyMapSdk = "true";
        script.onload = () => finish(); script.onerror = () => finish(new Error("地图加载失败，请检查网络后重试"));
        document.head.append(script);
      });
    })().catch(error => { pending = null; throw error; });
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    pending!.then(value => { signal.removeEventListener("abort", abort); if (!signal.aborted) resolve(value); },
      error => { signal.removeEventListener("abort", abort); if (!signal.aborted) reject(error); });
  });
}
