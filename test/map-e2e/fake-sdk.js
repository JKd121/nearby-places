// Browser-only SDK contract fixture. No map tiles or upstream services are requested.
(() => {
  const state = window.__mapHarness = { liveMaps: 0, created: 0, destroyed: 0, listeners: 0, updates: 0, submitted: 0, groups: [], frames: 0 };
  const active = new Set();
  class FakeMap {
    constructor(host, options) {
      this.host = host; this.center = options.center; this.zoom = options.zoom; this.events = new Map(); this.markers = new Set(); this.clusters = new Set(); this.circles = new Set(); this.width = host.clientWidth; this.height = host.clientHeight;
      state.liveMaps++; state.created++; active.add(this);
      host.style.background = '#f2f5ed'; host.style.backgroundImage = 'linear-gradient(24deg, transparent 47%, #ffdf9e 48%, #fff4d5 50%, #ffdf9e 52%, transparent 53%),linear-gradient(112deg,transparent 47%,#d9e6f5 48%,#fff 50%,#d9e6f5 52%,transparent 53%),linear-gradient(#d9e0d755 1px,transparent 1px),linear-gradient(90deg,#d9e0d755 1px,transparent 1px)';
      host.style.backgroundSize = '100% 100%,100% 100%,45px 45px,45px 45px';
      const label = document.createElement('span'); label.textContent = '地图 SDK 夹具'; label.style.cssText = 'position:absolute;left:10px;bottom:5px;font-size:10px;color:#888'; host.append(label);
      setTimeout(() => this.emit('complete'), 0);
    }
    on(event, fn) { const callbacks = this.events.get(event) ?? new Set(); callbacks.add(fn); this.events.set(event, callbacks); state.listeners++; }
    off(event, fn) { if (this.events.get(event)?.delete(fn)) state.listeners--; }
    emit(event) { for (const fn of this.events.get(event) ?? []) fn(); }
    add(item) { item.setMap?.(this); }
    remove(item) { item.setMap?.(null); }
    getSize() { return { width: this.width, height: this.height }; }
    getZoom() { return this.zoom; }
    getCenter() { return { lng: this.center[0], lat: this.center[1] }; }
    lngLatToContainer([lng, lat]) { const scale = 10000 * 2 ** (this.zoom - 14); return { x: this.width / 2 + (lng - this.center[0]) * scale, y: this.height / 2 - (lat - this.center[1]) * scale }; }
    setZoomAndCenter(zoom, center) { this.emit('zoomstart'); this.zoom = zoom; this.center = center; this.reposition(); for (const cluster of this.clusters) cluster.render(); this.emit('zoomend'); }
    panTo(center) { this.emit('movestart'); this.center = center; this.reposition(); for (const cluster of this.clusters) cluster.render(); this.emit('moveend'); }
    setBounds(bounds) { const [zoom, center] = this.getFitZoomAndCenterByBounds(bounds); this.setZoomAndCenter(zoom, [center.lng, center.lat]); }
    getFitZoomAndCenterByBounds(bounds) {
      if (bounds.radius) { return [14 + Math.log2(Math.max(100, Math.min(this.host.clientWidth - 120, this.host.clientHeight - 120)) / (bounds.radius / 111320 * 2 * 10000)), { lng: bounds.center[0], lat: bounds.center[1] }]; }
      const span = Math.max(bounds.ne[0] - bounds.sw[0], bounds.ne[1] - bounds.sw[1], .00001);
      return [Math.min(20, 14 + Math.log2(Math.min(this.host.clientWidth, this.host.clientHeight) / (span * 10000))), { lng: (bounds.sw[0] + bounds.ne[0]) / 2, lat: (bounds.sw[1] + bounds.ne[1]) / 2 }];
    }
    reposition() { for (const marker of this.markers) marker.position(); for (const circle of this.circles) circle.render(); }
    resize() { this.width = this.host.clientWidth; this.height = this.host.clientHeight; this.reposition(); }
    destroy() { state.listeners -= [...this.events.values()].reduce((n, callbacks) => n + callbacks.size, 0); this.events.clear(); for (const marker of [...this.markers]) marker.setMap(null); state.liveMaps--; state.destroyed++; active.delete(this); this.host.replaceChildren(); }
  }
  class Marker {
    constructor(options = {}) { this.lnglat = options.position ?? [114.03,22.61]; this.offset = { x: 0, y: 0 }; this.element = document.createElement('div'); this.element.style.cssText = `position:absolute;z-index:${options.zIndex ?? 120}`; if (options.anchor === 'bottom-center') this.element.style.transform = 'translate(-50%,-100%)'; if (options.content) this.setContent(options.content); }
    setMap(map) { this.map?.markers.delete(this); this.element.remove(); this.map = map; if (map) { map.markers.add(this); map.host.append(this.element); this.position(); } }
    setContent(content) { this.element.replaceChildren(); if (typeof content === 'string') this.element.textContent = content; else { this.element.append(content); if (content.classList.contains('nearby-map-center') || content.classList.contains('nearby-map-selected')) this.element.style.pointerEvents = 'none'; } }
    setPosition(position) { this.lnglat = position; this.position(); }
    setOffset(offset) { this.offset = offset; this.position(); }
    position() { if (!this.map) return; const pixel = this.map.lngLatToContainer(this.lnglat); this.element.style.left = `${pixel.x + this.offset.x}px`; this.element.style.top = `${pixel.y + this.offset.y}px`; }
  }
  class Circle {
    constructor(options) { this.center = options.center; this.radius = options.radius; this.element = document.createElement('div'); this.element.style.cssText = 'position:absolute;border:2px dashed #ff3d81;border-radius:50%;background:#ff3d8110;pointer-events:none;z-index:30'; }
    setMap(map) { this.map?.circles.delete(this); this.element.remove(); this.map = map; if (map) { map.circles.add(this); map.host.append(this.element); this.render(); } }
    render() { if (!this.map) return; const center = this.map.lngLatToContainer(this.center); const radius = this.radius / 111320 * 10000 * 2 ** (this.map.zoom - 14); Object.assign(this.element.style, { left: `${center.x - radius}px`, top: `${center.y - radius}px`, width: `${radius * 2}px`, height: `${radius * 2}px` }); }
    setCenter(center) { this.center = center; }
    setRadius(radius) { this.radius = radius; state.radius = radius; this.render(); }
    getBounds() { return { center: this.center, radius: this.radius }; }
  }
  class MarkerCluster {
    constructor(map, data, options) { this.map = map; this.data = data; this.options = options; this.markers = []; map.clusters.add(this); }
    setData(data) { this.data = data; state.updates++; state.submitted = data.length; this.render(); }
    setGridSize(size) { this.options.gridSize = size; }
    setMap(map) { this.map?.clusters.delete(this); for (const marker of this.markers) marker.setMap(null); this.markers = []; this.map = map; if (map) map.clusters.add(this); }
    render() {
      if (!this.map) return; for (const marker of this.markers) marker.setMap(null); this.markers = [];
      const groups = new Map();
      for (const item of this.data) { const pixel = this.map.lngLatToContainer(item.lnglat); const key = `${Math.floor(pixel.x / this.options.gridSize)},${Math.floor(pixel.y / this.options.gridSize)}`; const group = groups.get(key) ?? []; group.push(item); groups.set(key, group); }
      state.groups = [...groups.values()].map(group => group.map(item => item.point.key));
      for (const group of groups.values()) {
        const position = [group.reduce((n,item) => n + item.lnglat[0],0) / group.length, group.reduce((n,item) => n + item.lnglat[1],0) / group.length];
        const marker = new Marker({ position }); marker.setMap(this.map); this.markers.push(marker);
        const context = { marker, count: group.length, clusterData: group, data: group };
        if (group.length > 1) this.options.renderClusterMarker(context); else this.options.renderMarker(context);
      }
    }
  }
  window.AMap = { Map: FakeMap, Marker, Circle, MarkerCluster,
    Pixel: class { constructor(x,y) { this.x=x; this.y=y; } }, Bounds: class { constructor(sw,ne) { this.sw=sw; this.ne=ne; } } };
  window.__mapHarness.move = (zoom, center = [114.03,22.61]) => { for (const map of active) map.setZoomAndCenter(zoom, center); };
})();
