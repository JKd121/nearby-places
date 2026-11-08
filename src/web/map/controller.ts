import type { Coordinates } from "../../amap/types.js";
import { CATEGORY_APPEARANCE, MAP_METRICS, clusterAppearance, sameCoordinates, selectionFor, viewportPlaces,
  type MapPlace, type MapSelection } from "./model.js";
import type { AmapSdk, ClusterContext, LngLat, MapCircle, MapCluster, MapInstance, MapMarker } from "./sdk.js";
import { categorySvgElement } from "../ui/category-shapes.js";

interface Callbacks {
  onSelect: (selection: MapSelection) => void;
  onCluster: (points: MapPlace[]) => void;
  onVisibleCount: (count: number) => void;
}

/** SDK objects and frame state deliberately live outside React. */
export class NearbyMapController {
  private map: MapInstance;
  private cluster: MapCluster;
  private circle: MapCircle;
  private centerMarker: MapMarker;
  private selectedMarker: MapMarker;
  private canvas = document.createElement("canvas");
  private observer: ResizeObserver;
  private motion = matchMedia("(prefers-reduced-motion: reduce)");
  private mobile = matchMedia("(max-width: 700px)");
  private center: LngLat;
  private radius: number;
  private displayedRadius: number;
  private points: MapPlace[] = [];
  private signature = "";
  private submitted = "";
  private knownKeys = new Set<string>();
  private newKeys = new Set<string>();
  private glowingKeys = new Set<string>();
  private glowBudget = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;
  private lastFrame = 0;
  private feedbackStart = 0;
  private feedbackFrame = 0;
  private angle = 0;
  private searching = false;
  private visible = true;
  private moving = false;
  private destroyed = false;
  private glowingElements = new Set<HTMLElement>();
  private glowTimers = new Set<ReturnType<typeof setTimeout>>();
  private gridSize: number = MAP_METRICS.desktopGrid;
  private eventBindings: Array<[string, () => void]>;

  constructor(private sdk: AmapSdk, private host: HTMLElement, center: Coordinates, radius: number,
    name: string, private callbacks: Callbacks) {
    this.center = [center.longitude, center.latitude];
    this.radius = this.displayedRadius = radius;
    this.map = new sdk.Map(host, { center: this.center, zoom: 14, zooms: [3, MAP_METRICS.maxZoom],
      viewMode: "2D", resizeEnable: true, showLabel: true });
    this.circle = new sdk.Circle({ center: this.center, radius, strokeColor: "#ff3d81", strokeWeight: 2,
      strokeStyle: "dashed", fillColor: "#ff3d81", fillOpacity: 0.07, zIndex: 30 });
    this.map.add(this.circle);
    const pin = document.createElement("div"); pin.className = "nearby-map-center";
    const pinIcon = document.createElement("span"); pinIcon.textContent = "●";
    const pinLabel = document.createElement("strong"); pinLabel.textContent = name;
    pin.append(pinIcon, pinLabel);
    this.centerMarker = new sdk.Marker({ position: this.center, content: pin, anchor: "bottom-center", zIndex: 180, clickable: false });
    this.centerMarker.setMap(this.map);
    this.selectedMarker = new sdk.Marker({ anchor: "bottom-center", zIndex: 200, clickable: false });
    this.gridSize = this.mobile.matches ? MAP_METRICS.mobileGrid : MAP_METRICS.desktopGrid;
    this.cluster = new sdk.MarkerCluster(this.map, [], { gridSize: this.gridSize,
      maxZoom: MAP_METRICS.maxZoom + 1, zoomOnClick: false, clusterByZoomChange: false,
      renderMarker: context => this.renderMarker(context, false),
      renderClusterMarker: context => this.renderMarker(context, true) });
    this.canvas.className = "nearby-map-radar"; this.canvas.setAttribute("aria-hidden", "true");
    host.append(this.canvas);
    this.eventBindings = [
      ["movestart", this.startMove], ["zoomstart", this.startMove],
      ["moveend", this.endMove], ["zoomend", this.endMove], ["complete", this.resize],
    ];
    for (const [event, listener] of this.eventBindings) this.map.on(event, listener);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(host);
    document.addEventListener("visibilitychange", this.syncAnimation);
    this.motion.addEventListener("change", this.syncAnimation);
    this.mobile.addEventListener("change", this.resize);
    this.fitCenter(); this.resize();
  }

  private startMove = () => { this.moving = true; this.glowingKeys.clear(); this.clearGlows(); this.stopFrame(); this.canvas.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height); };
  private endMove = () => { this.moving = false; this.newKeys.clear(); this.scheduleUpdate(); this.syncAnimation(); };
  private resize = () => {
    if (this.destroyed || !this.host.clientWidth || !this.host.clientHeight) return;
    this.map.resize();
    const ratio = Math.min(devicePixelRatio || 1, MAP_METRICS.maxPixelRatio);
    this.canvas.width = Math.round(this.host.clientWidth * ratio); this.canvas.height = Math.round(this.host.clientHeight * ratio);
    const grid = this.mobile.matches ? MAP_METRICS.mobileGrid : MAP_METRICS.desktopGrid;
    if (grid !== this.gridSize) { this.gridSize = grid; this.cluster.setGridSize(grid); }
    this.submitted = ""; this.scheduleUpdate(); this.draw();
  };

  setData(points: MapPlace[]) {
    const signature = JSON.stringify(points.map(point => [point.key, point.longitude, point.latitude, point.categories]));
    if (signature === this.signature) return;
    if (!points.length) this.feedbackStart = 0;
    else if (!this.feedbackStart) this.feedbackStart = performance.now();
    this.signature = signature;
    if (!points.length) { this.knownKeys.clear(); this.newKeys.clear(); }
    for (const point of points) if (!this.knownKeys.has(point.key)) this.newKeys.add(point.key);
    this.knownKeys = new Set(points.map(point => point.key)); this.points = points;
    this.scheduleUpdate();
  }

  setRadius(radius: number) {
    if (this.radius === radius) return;
    this.radius = radius;
    if (this.motion.matches) { this.displayedRadius = radius; this.circle.setRadius(radius); }
    // Fit to the final bounds once; the circle itself interpolates in the frame loop.
    this.circle.setRadius(radius); this.fitCenter(); this.circle.setRadius(this.displayedRadius);
    this.syncAnimation();
  }

  setState(searching: boolean, visible: boolean) {
    this.searching = searching;
    const showing = visible && !this.visible;
    this.visible = visible;
    if (showing) this.resize();
    this.syncAnimation();
  }

  select(selection: MapSelection | null, pan = true) {
    const point = this.points.find(item => item.key === selection?.pointKey);
    if (!point || !selection) { this.selectedMarker.setMap(null); return; }
    const entry = point.entries.find(item => item.key === selection.entryKey) ?? point.entries[0]!;
    const content = document.createElement("div"); content.className = "nearby-map-selected";
    const symbol = document.createElement("span"); symbol.append(categorySvgElement(entry.category));
    symbol.style.background = CATEGORY_APPEARANCE[entry.category].color;
    const label = document.createElement("strong"); label.textContent = entry.place.name;
    content.append(symbol, label); this.selectedMarker.setContent(content);
    this.selectedMarker.setPosition([point.longitude, point.latitude]); this.selectedMarker.setMap(this.map);
    if (pan) this.map.panTo([point.longitude, point.latitude]);
  }

  zoom(delta: number) {
    const center = this.map.getCenter();
    this.map.setZoomAndCenter(Math.max(3, Math.min(MAP_METRICS.maxZoom, this.map.getZoom() + delta)), [center.lng, center.lat]);
  }
  fitCenter() { this.map.setBounds(this.circle.getBounds(), false, [64, 40, 56, 40]); }

  private scheduleUpdate() {
    if (this.destroyed || this.timer !== undefined) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, MAP_METRICS.updateMs);
  }

  private flush() {
    if (this.destroyed || !this.visible || this.moving || !this.host.clientWidth) return;
    const start = performance.now();
    const { width, height } = this.map.getSize();
    const view = viewportPlaces(this.points, width, height, point => this.map.lngLatToContainer([point.longitude, point.latitude]));
    this.callbacks.onVisibleCount(view.visibleCount);
    const signature = JSON.stringify([this.signature, this.map.getZoom(), view.points.map(point => point.key)]);
    if (signature !== this.submitted) {
      this.submitted = signature; this.glowBudget = this.motion.matches ? 0 : MAP_METRICS.maxGlows;
      this.glowingKeys = new Set(this.newKeys);
      this.cluster.setData(view.points.map(point => ({ lnglat: [point.longitude, point.latitude], point })));
      this.newKeys.clear();
      performance.measure("nearby-map-update", { start, end: performance.now() });
      performance.clearMeasures("nearby-map-update");
    }
  }

  private renderMarker(context: ClusterContext, aggregated: boolean) {
    const points = (context.clusterData ?? context.data ?? []).map(item => item.point).filter(Boolean);
    if (!points.length) return;
    const appearance = aggregated ? clusterAppearance(points)
      : { color: CATEGORY_APPEARANCE[points[0]!.categories[0]!].color, size: MAP_METRICS.singleSize };
    const button = document.createElement("button"); button.type = "button";
    button.className = "nearby-map-point";
    button.style.setProperty("--point-color", appearance.color);
    button.style.setProperty("--point-size", `${appearance.size}px`);
    if (aggregated) button.textContent = String(points.length);
    else button.append(categorySvgElement(points[0]!.categories[0]!));
    button.setAttribute("aria-label", aggregated ? `查看聚合的 ${points.length} 个地点` : `查看地点：${points[0]!.entries[0]!.place.name}`);
    button.addEventListener("click", event => {
      event.stopPropagation();
      if (aggregated) this.openCluster(points);
      else this.callbacks.onSelect(selectionFor(points[0]!));
    });
    if (this.glowBudget > 0 && !this.moving && this.visible && !document.hidden && points.some(point => this.glowingKeys.has(point.key))) {
      this.glowBudget--; button.classList.add("nearby-map-glow"); this.glowingElements.add(button);
      const timer = setTimeout(() => { button.classList.remove("nearby-map-glow"); this.glowingElements.delete(button); this.glowTimers.delete(timer); }, MAP_METRICS.glowMs);
      this.glowTimers.add(timer);
    }
    context.marker.setContent(button); context.marker.setOffset(new this.sdk.Pixel(-appearance.size / 2, -appearance.size / 2));
    if (this.feedbackStart && !this.feedbackFrame) {
      this.feedbackFrame = requestAnimationFrame(() => {
        this.feedbackFrame = 0;
        if (this.feedbackStart) {
          performance.measure("nearby-map-feedback", { start: this.feedbackStart, end: performance.now() });
          performance.clearMeasures("nearby-map-feedback"); this.feedbackStart = 0;
        }
      });
    }
  }

  private openCluster(points: MapPlace[]) {
    this.callbacks.onCluster(points);
    if (sameCoordinates(points) || this.map.getZoom() >= MAP_METRICS.maxZoom) return;
    const lngs = points.map(point => point.longitude), lats = points.map(point => point.latitude);
    const bounds = new this.sdk.Bounds([Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]);
    const [fitZoom, center] = this.map.getFitZoomAndCenterByBounds(bounds, [60, 60, 60, 60]);
    const zoom = Math.min(MAP_METRICS.maxZoom, this.map.getZoom() + 2, Math.max(this.map.getZoom() + 1, fitZoom));
    this.map.setZoomAndCenter(zoom, [center.lng, center.lat]);
  }

  private clearGlows() {
    for (const element of this.glowingElements) element.classList.remove("nearby-map-glow");
    this.glowingElements.clear(); for (const timer of this.glowTimers) clearTimeout(timer); this.glowTimers.clear();
  }
  private stopFrame() { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.lastFrame = 0; }
  private syncAnimation = () => {
    if (this.destroyed) return;
    this.stopFrame();
    if (this.motion.matches) { this.displayedRadius = this.radius; this.circle.setRadius(this.radius); this.clearGlows(); }
    if (!this.visible || document.hidden || this.moving) { this.clearGlows(); return; }
    this.draw();
    if (!this.motion.matches && (this.searching || Math.abs(this.radius - this.displayedRadius) > 1)) this.frame = requestAnimationFrame(this.tick);
  };
  private tick = (time: number) => {
    this.frame = 0;
    if (this.destroyed || !this.visible || document.hidden || this.moving || this.motion.matches) return;
    if (!this.lastFrame || time - this.lastFrame >= 1000 / MAP_METRICS.fps) {
      const delta = this.lastFrame ? Math.min(100, time - this.lastFrame) : 33;
      this.lastFrame = time; this.angle = (this.angle + delta / 4000 * Math.PI * 2) % (Math.PI * 2);
      this.displayedRadius += (this.radius - this.displayedRadius) * Math.min(1, delta / 90);
      if (Math.abs(this.radius - this.displayedRadius) < 1) this.displayedRadius = this.radius;
      this.circle.setRadius(this.displayedRadius); this.draw();
    }
    if (this.searching || this.displayedRadius !== this.radius) this.frame = requestAnimationFrame(this.tick);
  };
  private draw() {
    const context = this.canvas.getContext("2d"); if (!context) return;
    const ratio = Math.min(devicePixelRatio || 1, MAP_METRICS.maxPixelRatio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, this.canvas.width / ratio, this.canvas.height / ratio);
    if (!this.searching || !this.visible || document.hidden || this.motion.matches || this.moving) return;
    const center = this.map.lngLatToContainer(this.center);
    const east = this.map.lngLatToContainer([this.center[0] + this.displayedRadius / (111320 * Math.cos(this.center[1] * Math.PI / 180)), this.center[1]]);
    const radius = Math.abs(east.x - center.x);
    if (!Number.isFinite(radius) || !radius) return;
    context.save(); context.translate(center.x, center.y); context.rotate(this.angle);
    const slices = 24, sweep = Math.PI / 2;
    for (let i = 0; i < slices; i++) {
      context.beginPath(); context.moveTo(0, 0); context.arc(0, 0, radius, -sweep + i * sweep / slices, -sweep + (i + 1) * sweep / slices);
      context.closePath(); context.fillStyle = `rgba(255,61,129,${0.015 + i / slices * 0.22})`; context.fill();
    }
    context.restore();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.stopFrame(); this.clearGlows(); clearTimeout(this.timer); cancelAnimationFrame(this.feedbackFrame); this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.syncAnimation); this.motion.removeEventListener("change", this.syncAnimation);
    this.mobile.removeEventListener("change", this.resize);
    for (const [event, listener] of this.eventBindings) this.map.off(event, listener);
    this.cluster.setMap(null); this.selectedMarker.setMap(null); this.centerMarker.setMap(null);
    this.map.destroy(); this.canvas.remove(); this.points = []; this.knownKeys.clear(); this.newKeys.clear();
  }
}
