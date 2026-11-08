"use client";

import { useEffect, useRef, useState } from "react";
import type { LocationCandidate } from "../location/types";
import { CATEGORIES } from "../amap/categories";
import { NearbyMapController } from "./map/controller";
import { CATEGORY_APPEARANCE, MAP_METRICS, clusterSummary, selectionFor, type MapPlace, type MapSelection } from "./map/model";
import { loadMapSdk } from "./map/sdk";
import s from "./nearby-map.module.css";

interface Props {
  center: LocationCandidate; radius: number; searching: boolean; visible: boolean; points: MapPlace[];
  selection: MapSelection | null; sessionId: string | undefined; onSelect: (selection: MapSelection) => void;
}

export default function NearbyMap(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<NearbyMapController | null>(null);
  const latest = useRef(props);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [members, setMembers] = useState<MapPlace[]>([]);
  const [memberCount, setMemberCount] = useState<number>(MAP_METRICS.memberPageSize);
  const clusterRef = useRef<HTMLDivElement>(null);
  useEffect(() => { latest.current = props; });

  useEffect(() => {
    const abort = new AbortController();
    setStatus("loading"); setMembers([]); setVisibleCount(0);
    void loadMapSdk(props.sessionId, abort.signal).then(sdk => {
      if (abort.signal.aborted || !host.current) return;
      const current = latest.current;
      const instance = new NearbyMapController(sdk, host.current, current.center.location, current.radius, current.center.name, {
        onSelect: selection => latest.current.onSelect(selection),
        onCluster: points => { setMembers(points); setMemberCount(MAP_METRICS.memberPageSize); },
        onVisibleCount: setVisibleCount,
      });
      controller.current = instance;
      instance.setData(current.points); instance.setState(current.searching, current.visible);
      instance.select(current.selection, false); setStatus("ready");
    }).catch(cause => {
      if (abort.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "地图加载失败，请重试"); setStatus("error");
    });
    return () => { abort.abort(); controller.current?.destroy(); controller.current = null; };
  }, [props.center.location.longitude, props.center.location.latitude, props.center.name, props.sessionId, retry]);

  useEffect(() => { controller.current?.setData(props.points); setMembers([]); }, [props.points]);
  useEffect(() => { controller.current?.setRadius(props.radius); }, [props.radius]);
  useEffect(() => { controller.current?.setState(props.searching, props.visible); }, [props.searching, props.visible]);
  useEffect(() => { controller.current?.select(props.selection); setMembers([]); }, [props.selection]);
  useEffect(() => { if (members.length) clusterRef.current?.focus({ preventScroll: true }); }, [members]);

  function selectPoint(point: MapPlace) { props.onSelect(selectionFor(point)); setMembers([]); }
  const summary = clusterSummary(members);
  return <section className={s.panel} aria-label="附近地图" data-map-state={status}>
    <div ref={host} className={s.canvas} aria-label="高德地图" />
    {status === "ready" && <>
      <div className={s.status} role="status"><span className={s.statusDot} data-searching={props.searching} />{props.searching ? "正在搜索附近" : "附近地图"}</div>
      <div className={s.range}>{props.radius / 1000} 公里范围</div>
      <div className={s.count}>已获取 {props.points.length} 个地点 · 当前视野 {visibleCount} 个</div>
      <div className={s.controls}>
        <button type="button" aria-label="放大地图" onClick={() => controller.current?.zoom(1)}>＋</button>
        <button type="button" aria-label="缩小地图" onClick={() => controller.current?.zoom(-1)}>−</button>
        <button type="button" aria-label="回到搜索中心" onClick={() => controller.current?.fitCenter()}>◎</button>
      </div>
      <div className={s.legend} aria-label="地图图例">{CATEGORIES.filter(category => props.points.some(point => point.categories.includes(category.key))).map(category =>
        <span key={category.key}><i style={{ background: CATEGORY_APPEARANCE[category.key].color }} />{category.label}</span>)}<span><i className={s.mixed} />聚合数量</span></div>
    </>}
    {status !== "ready" && <div className={s.fallback} role="status">
      <span className={s.placeholderPin}>◎</span><h2>{status === "loading" ? "正在展开地图…" : "地图暂未加载"}</h2>
      <p>{status === "loading" ? `正在定位 ${props.center.name}` : error}</p>
      {status === "error" && <button type="button" onClick={() => setRetry(value => value + 1)}>重试地图</button>}
      <p>左侧可继续查看和搜索附近地点。</p>
    </div>}
    {members.length > 0 && <div ref={clusterRef} className={s.members} tabIndex={-1} role="region" aria-label="聚合内的地点" onKeyDown={event => {
      if (event.key === "Escape") { setMembers([]); host.current?.querySelector<HTMLButtonElement>(".nearby-map-point")?.focus(); }
    }}>
      <div className={s.memberHeading}><strong>{members.length} 个地点</strong><button type="button" aria-label="关闭聚合地点" onClick={() => setMembers([])}>×</button></div>
      <p className={s.summary}>{CATEGORIES.filter(category => summary[category.key]).map(category => `${category.label} ${summary[category.key]}`).join(" · ")}</p>
      <ul>{members.slice(0, memberCount).map(point => <li key={point.key}><button type="button" onClick={() => selectPoint(point)}><strong>{point.entries[0]!.place.name}</strong><span>{point.entries.map(entry => CATEGORIES.find(category => category.key === entry.category)?.label).join(" / ")}</span></button></li>)}</ul>
      {memberCount < members.length && <button type="button" onClick={() => setMemberCount(value => value + MAP_METRICS.memberPageSize)}>再显示 20 个地点</button>}
    </div>}
  </section>;
}
