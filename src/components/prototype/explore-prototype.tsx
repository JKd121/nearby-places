"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Dialog } from "radix-ui";
import { Bookmark, Check, ChevronDown, ChevronUp, CircleUserRound, Croissant, Dumbbell, Flame, History, House, MapPin, Menu, MicVocal, Pencil, Plus, Search, ShoppingBag, X } from "lucide-react";
import { CATEGORIES } from "../../amap/categories";
import type { CategoryKey } from "../../amap/types";
import { Button } from "../ui/button";

const featured = [
  { key: "hotpot", icon: Flame }, { key: "bakery", icon: Croissant },
  { key: "ktv", icon: MicVocal }, { key: "gym", icon: Dumbbell }, { key: "mall", icon: ShoppingBag },
] as const;
const places: { id: string; name: string; category: CategoryKey; detail: string; address: string; distance: number; art: string }[] = [
  { id: "demo-1", name: "北城火锅", category: "hotpot", detail: "火锅", address: "龙华区站前路附近 · 演示地址", distance: 320, art: "pot" },
  { id: "demo-2", name: "巷里老火锅", category: "hotpot", detail: "火锅　川味　朋友聚餐", address: "龙华区民治街道附近 · 演示地址", distance: 540, art: "dish" },
  { id: "demo-3", name: "街角运动馆", category: "gym", detail: "健身　器械训练", address: "龙华区北站东侧 · 演示地址", distance: 760, art: "gym" },
  { id: "demo-4", name: "麦香面包房", category: "bakery", detail: "面包　烘焙", address: "龙华区站前街区 · 演示地址", distance: 1200, art: "bread" },
  { id: "demo-5", name: "夜色 KTV", category: "ktv", detail: "KTV　聚会", address: "龙华区民治大道附近 · 演示地址", distance: 1400, art: "ktv" },
  { id: "demo-6", name: "邻里商场", category: "mall", detail: "商场　生活购物", address: "龙华区南侧街区 · 演示地址", distance: 1800, art: "mall" },
];
const centerName = "深圳北站西广场";
const label = (key: CategoryKey) => CATEGORIES.find((category) => category.key === key)?.label ?? key;

function Thumbnail({ kind }: { kind: string }) {
  const palette: Record<string, [string, string]> = { pot: ["#6e5138", "#bda078"], dish: ["#b18b60", "#ead9b6"], gym: ["#263330", "#8e9890"], bread: ["#dbc8af", "#f0e5d4"], ktv: ["#693c52", "#251f33"], mall: ["#839e98", "#dce5dc"] };
  const [base, light] = palette[kind] ?? palette.pot;
  return <svg className="proto-thumbnail" viewBox="0 0 84 76" role="img" aria-label="演示地点示意图">
    <rect width="84" height="76" rx="9" fill={base} /><rect x="8" y="8" width="68" height="60" rx="5" fill={light} opacity=".5" />
    {kind === "gym" ? <g stroke="#a8b1a3" strokeWidth="2"><path d="M18 17v42m16-42v42m16-42v42m16-42v42" /></g>
      : kind === "ktv" || kind === "mall" ? <g stroke={light} strokeWidth="2" opacity=".7"><path d="M15 23h54M15 34h54M15 45h54M15 56h54" /></g>
        : <><ellipse cx="42" cy="38" rx="27" ry="21" fill="#eee0c5" /><ellipse cx="42" cy="38" rx="20" ry="15" fill="#805633" /><ellipse cx="42" cy="38" rx="12" ry="9" fill="#d8af6d" /></>}
  </svg>;
}

export default function ExplorePrototype() {
  const [query, setQuery] = useState(centerName);
  const [confirmed, setConfirmed] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [selected, setSelected] = useState<CategoryKey[]>(["hotpot"]);
  const [applied, setApplied] = useState<CategoryKey[] | null>(null);
  const [radius, setRadius] = useState(3);
  const [searching, setSearching] = useState(false);
  const [sort, setSort] = useState("preview");
  const [active, setActive] = useState("demo-1");
  const [saved, setSaved] = useState<string[]>(["demo-1"]);
  const [expanded, setExpanded] = useState(true);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const visible = places.filter((place) => applied === null || applied.includes(place.category)).toSorted((a, b) => sort === "distance" ? a.distance - b.distance : 0);

  function toggleCategory(key: CategoryKey) {
    setSelected((current) => current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]);
  }
  function resolveDemo() {
    if (resolving || searching) return;
    if (!query.trim()) { inputRef.current?.focus(); setNotice("请输入地点名称；候选为演示数据。"); return; }
    setResolving(true);
    timerRef.current = setTimeout(() => { setResolving(false); setCandidatesOpen(true); }, 350);
  }
  function editCenter() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setResolving(false); setSearching(false); setConfirmed(false); setNotice("修改输入后解析；本原型只提供固定演示候选。");
    inputRef.current?.focus();
  }
  function searchDemo() {
    if (!confirmed || selected.length === 0) return;
    setSearching(true); setExpanded(true);
    timerRef.current = setTimeout(() => {
      setApplied([...selected]); setSearching(false);
      setNotice("已更新本地演示列表；未调用搜索 API。");
      resultsRef.current?.focus();
    }, 350);
  }

  const nav = <><nav aria-label="原型全局导航">
    {[{ name: "首页", icon: House }, { name: "探索地点", icon: Search }, { name: "我的地点", icon: Bookmark }, { name: "搜索历史", icon: History }].map(({ name, icon: Icon }) => <button type="button" key={name} className={name === "探索地点" ? "proto-nav-item is-active" : "proto-nav-item"} aria-current={name === "探索地点" ? "page" : undefined} title={name} onClick={() => { setNavigationOpen(false); setNotice(name === "探索地点" ? "当前为 Explore 视觉原型。" : "阶段 A 仅提供 Explore 原型，该入口暂未接入。"); }}><Icon aria-hidden="true" /><span>{name}</span></button>)}
  </nav><div className="proto-sidebar-account"><CircleUserRound aria-hidden="true" /><div><strong>游客模式</strong><span>阶段 A · 账户未接入</span></div></div></>;

  return <div className="explore-prototype">
    <a className="skip-link" href="#prototype-main">跳到原型主要内容</a>
    <aside className="proto-sidebar"><a href="/prototype/explore" className="proto-brand" aria-label="Nearby 原型"><MapPin aria-hidden="true" />nearby</a>{nav}</aside>
    <main id="prototype-main" className="proto-main">
      <header className="proto-header"><Button variant="ghost" size="icon" ref={menuRef} className="proto-menu" aria-label="打开原型导航" onClick={() => setNavigationOpen(true)}><Menu aria-hidden="true" /></Button><h1>探索地点</h1><div className="proto-header-right"><span className="proto-demo-badge">视觉原型 · 演示数据</span><span className="proto-guest"><CircleUserRound aria-hidden="true" /><span>游客模式</span></span></div></header>
      <section className="proto-search" aria-label="探索中心">
        <form onSubmit={(event) => { event.preventDefault(); resolveDemo(); }} className="proto-search-form">
          <div className="proto-query"><Search aria-hidden="true" /><label className="sr-only" htmlFor="proto-query">地点名称</label><input ref={inputRef} id="proto-query" name="prototype-location" autoComplete="off" value={query} placeholder="输入地点名称…" onChange={(event) => { if (timerRef.current) clearTimeout(timerRef.current); setResolving(false); setSearching(false); setQuery(event.target.value); setConfirmed(false); }} /><button type="button" aria-label="清空原型地点" onClick={() => { setQuery(""); editCenter(); }}><X aria-hidden="true" /></button></div>
          <Button variant="ghost" className="proto-parse" type="submit" disabled={resolving}>{resolving ? "解析中…" : "解析地点"}</Button>
        </form>
        <div className="proto-confirmed"><MapPin aria-hidden="true" /><div><strong>{confirmed ? centerName : "请选择探索中心"}</strong><span>{confirmed ? "深圳市 · 龙华区" : "解析后选择演示候选"}</span></div><Button variant="ghost" className="proto-edit" onClick={editCenter}><Pencil aria-hidden="true" />修改地点</Button></div>
      </section>
      <section className="proto-toolbar" aria-label="附近生活服务">
        <h2>附近生活服务</h2><div className="proto-category-strip" tabIndex={0} aria-label="演示类别，可横向滚动">
          {featured.map(({ key, icon: Icon }) => <button type="button" key={key} aria-pressed={selected.includes(key)} onClick={() => toggleCategory(key)} className="proto-category"><Icon aria-hidden="true" />{label(key)}</button>)}
          <button type="button" ref={moreRef} className="proto-category proto-more" onClick={() => setCategoryOpen(true)}><Plus aria-hidden="true" />更多类别</button>
        </div>
        <label className="proto-radius"><span>搜索范围</span><select aria-label="原型搜索范围" value={radius} onChange={(event) => setRadius(Number(event.target.value))}>{[1, 2, 3, 5].map((value) => <option key={value} value={value}>{value} km</option>)}</select></label>
        <Button className="proto-search-button" onClick={searchDemo} disabled={!confirmed || !selected.length || searching || resolving}><Search aria-hidden="true" />{searching ? "更新演示…" : "搜索附近"}</Button>
      </section>
      <div className="proto-workspace">
        <section className="proto-results" data-expanded={expanded} aria-label="演示地点列表" aria-busy={searching}>
          <header className="proto-results-header"><div><h2 tabIndex={-1} ref={resultsRef}>附近地点</h2><p>{visible.length} 个演示地点{applied !== null ? " · 本地筛选" : " · 版式示例"}</p></div><label className="proto-sort"><span className="sr-only">演示列表排序</span><select aria-label="演示列表排序" value={sort} onChange={(event) => setSort(event.target.value)}><option value="preview">默认排序</option><option value="distance">距离最近</option></select></label><Button variant="ghost" className="proto-result-toggle" aria-expanded={expanded} aria-controls="proto-place-list" onClick={() => setExpanded(!expanded)}>{expanded ? "收起" : "展开"}{expanded ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}</Button></header>
          <div className="proto-results-scroll" id="proto-place-list">{searching ? <p className="proto-empty" role="status">正在更新本地演示列表…</p> : visible.length === 0 ? <p className="proto-empty" role="status">所选类别暂无演示地点。可选择火锅等类别重试。</p> : <ol>{visible.map((place) => <li key={place.id} className={active === place.id ? "proto-place is-selected" : "proto-place"}>
            <button type="button" className="proto-place-select" aria-label={"选中演示地点：" + place.name} aria-pressed={active === place.id} onClick={() => setActive(place.id)}>
              <Thumbnail kind={place.art} /><span className="proto-place-copy"><strong>{place.name}</strong><span className="proto-place-details">{place.detail}</span><span className="proto-place-address">{place.address}</span></span><span className="proto-distance">{place.distance < 1000 ? place.distance + " m" : (place.distance / 1000).toFixed(1) + " km"}</span>
            </button>
            <button type="button" className="proto-bookmark" aria-label={"收藏演示：" + place.name + "（不保存）"} aria-pressed={saved.includes(place.id)} onClick={() => setSaved((current) => current.includes(place.id) ? current.filter((id) => id !== place.id) : [...current, place.id])}><Bookmark aria-hidden="true" fill={saved.includes(place.id) ? "currentColor" : "none"} /></button>
          </li>)}</ol>}</div>
          <footer className="proto-list-note">示例地点与收藏状态仅用于原型，不会保存。</footer>
        </section>
        <section className="proto-map" aria-label="静态示意地图，非实时高德地图">
          {/* This illustration derives only its map layer from the approved SVG. */}
          <img className="proto-map-base" src="/prototype/illustrative-map.svg" alt="" width={780} height={650} />
          {confirmed && <div className="proto-map-origin" style={{ "--range-factor": radius / 3 } as CSSProperties}>
            <div className="proto-range" data-testid="prototype-range-circle"><span className="proto-range-label">{radius} km</span></div>
            <div className="proto-center" data-testid="prototype-center-marker"><svg viewBox="-27 -28 54 74" aria-hidden="true"><path d="M0-25C-14-25-25-14-25 0c0 19 25 44 25 44S25 19 25 0C25-14 14-25 0-25Z" fill="currentColor" /><circle r="8" fill="white" /></svg><span><strong>{centerName}</strong><small>已确认的探索中心 · 演示</small></span></div>
          </div>}
          {!confirmed && <p className="proto-map-prompt">确认演示地点后显示中心与范围</p>}
          <p className="proto-map-disclosure">静态示意地图 · 非实时高德 · 范围为示意</p>
        </section>
      </div>
      <p className="proto-announcement sr-only" role="status">{notice}</p>
    </main>
    <Dialog.Root open={candidatesOpen} onOpenChange={setCandidatesOpen}><Dialog.Portal><Dialog.Overlay className="proto-dialog-overlay" /><Dialog.Content className="proto-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}><Dialog.Title>选择演示地点</Dialog.Title><Dialog.Description>固定候选仅供视觉交互评审，不来自地点解析 API。</Dialog.Description><button type="button" className="proto-demo-candidate" onClick={() => { setConfirmed(true); setQuery(centerName); setCandidatesOpen(false); setNotice("已确认演示中心。"); }}><MapPin aria-hidden="true" /><span><strong>{centerName}</strong><small>深圳市 · 龙华区 · 演示候选</small></span><Check aria-hidden="true" /></button><Dialog.Close asChild><Button variant="ghost">取消</Button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={categoryOpen} onOpenChange={setCategoryOpen}><Dialog.Portal><Dialog.Overlay className="proto-dialog-overlay" /><Dialog.Content className="proto-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); moreRef.current?.focus(); }}><Dialog.Title>选择演示类别</Dialog.Title><Dialog.Description>复用现有类别定义；只影响本地演示列表。</Dialog.Description><div className="proto-category-grid">{CATEGORIES.map((category) => <label key={category.key}><input type="checkbox" checked={selected.includes(category.key)} onChange={() => toggleCategory(category.key)} />{category.label}</label>)}</div><Dialog.Close asChild><Button>完成</Button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={navigationOpen} onOpenChange={setNavigationOpen}><Dialog.Portal><Dialog.Overlay className="proto-dialog-overlay" /><Dialog.Content className="proto-mobile-nav" onCloseAutoFocus={(event) => { event.preventDefault(); menuRef.current?.focus(); }}><div className="proto-mobile-nav-heading"><Dialog.Title>Nearby 原型</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭原型导航"><X aria-hidden="true" /></Button></Dialog.Close></div><Dialog.Description className="sr-only">阶段 A 仅展示 Explore；导航入口不接入业务。</Dialog.Description>{nav}</Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
