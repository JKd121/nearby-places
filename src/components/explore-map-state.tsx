import { MapPin } from "lucide-react";
import type { LocationCandidate } from "../location/types";
import type { SearchRadius } from "../search/contracts";

// Intentionally no geographic projection, tiles or illustrative roads. The
// verified coordinates are displayed as data, never positioned on a fake map.
export function ExploreMapState({ location, radiusMeters }: { location: LocationCandidate | null; radiusMeters: SearchRadius }) {
  return <aside className="workspace-map" aria-label="地图工作区">
    <div className="map-disclosure"><strong>地图尚未接入</strong><span>仅示意搜索条件，不表示地理位置或地图比例</span></div>
    {location ? <>
      <div className="map-condition-diagram">
        <div className="map-condition-range" data-testid="search-range-indicator"><span>{radiusMeters / 1000} km</span></div>
        <div className="map-condition-center" data-testid="search-center-indicator"><MapPin aria-hidden="true" /><strong>{location.name}</strong><span>已确认的搜索中心</span></div>
      </div>
      <p className="map-coordinate-data">已确认坐标 {location.location.longitude}, {location.location.latitude} · 真实底图待接入</p>
    </> : <p className="map-awaiting-center">确认一个地点后，在此查看搜索中心与范围条件。</p>}
  </aside>;
}
