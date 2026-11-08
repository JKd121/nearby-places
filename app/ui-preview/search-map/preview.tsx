"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Icon } from "../../../src/web/ui/icons";
import s from "./preview.module.css";
import { CategoryIcon } from "../../../src/web/ui/CategoryIcon";
import type { CategoryGroup } from "../../../src/amap/types";

type CategoryId = "hotel" | "mall" | "hotpot" | "bakery" | "dessert" | "ktv" | "billiards" | "gym" | "bus" | "subway";
type Glyph = CategoryId | CategoryGroup | "compass" | "chevron" | "check" | "radar";
const categories: { id: CategoryId; label: string; color: string; names: string[] }[] = [
  { id: "hotel", label: "酒店", color: "#ff3d81", names: ["维也纳酒店（深圳北站店）", "全季酒店（深圳北站店）", "桔子酒店（深圳北站店）"] },
  { id: "mall", label: "商场", color: "#ffd23f", names: ["天虹商场（深圳北站店）", "缤果空间", "红山6979商业中心"] },
  { id: "hotpot", label: "火锅", color: "#3ddc97", names: ["海底捞火锅（深圳北站店）", "巴奴毛肚火锅", "湊湊火锅·茶憩"] },
  { id: "bakery", label: "面包", color: "#ffd23f", names: ["好利来", "面包新语", "奈雪的茶"] },
  { id: "dessert", label: "甜品", color: "#c8a2ff", names: ["满记甜品", "许留山", "鲜芋仙"] },
  { id: "ktv", label: "KTV", color: "#c8a2ff", names: ["唱吧麦颂", "纯K", "星聚会"] },
  { id: "billiards", label: "台球厅", color: "#3ddc97", names: ["星牌台球俱乐部", "来力台球", "名仕台球"] },
  { id: "gym", label: "健身房", color: "#c8a2ff", names: ["超级猩猩健身", "乐刻运动", "中田健身工作室"] },
  { id: "bus", label: "公交站", color: "#c8a2ff", names: ["深圳北站交通枢纽", "北站东广场", "民塘路口"] },
  { id: "subway", label: "地铁站", color: "#3ddc97", names: ["深圳北站", "红山站", "民治站"] },
];
const groups = [
  { id: "stay", label: "住宿", glyph: "stay", color: "#ff3d81", ids: ["hotel"] },
  { id: "shopping", label: "购物", glyph: "shopping", color: "#ffd23f", ids: ["mall"] },
  { id: "food", label: "餐饮", glyph: "food", color: "#c8a2ff", ids: ["hotpot", "bakery", "dessert"] },
  { id: "play", label: "娱乐", glyph: "entertainment", color: "#3ddc97", ids: ["ktv", "billiards", "gym"] },
  { id: "transit", label: "交通", glyph: "transit", color: "#c8a2ff", ids: ["bus", "subway"] },
] as const;
const initialCategories = new Set<CategoryId>(["hotel", "mall", "hotpot", "dessert", "gym", "bus", "subway"]);
const stores = categories.flatMap((category, i) => category.names.map((name, j) => {
  const n = i * 3 + j, angle = n * 2.399963;
  const r = 16 + (n % 5) * 5.6;
  return { id: `${category.id}-${j}`, category, name, distance: [520, 890, 1200][j]!, rating: [4.6, 4.5, 4.7][j]!,
    x: 50 + Math.cos(angle) * r, y: 49 + Math.sin(angle) * r * .88 };
}));
type Store = (typeof stores)[number];

function GlyphIcon({ name, className }: { name: Glyph; className?: string }) {
  if (name !== "compass" && name !== "chevron" && name !== "check" && name !== "radar") return <CategoryIcon name={name} className={className} />;
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {name === "compass" && <><circle cx="12" cy="12" r="9" /><path d="m16 8-2.2 5.8L8 16l2.2-5.8L16 8Z" /></>}
    {name === "chevron" && <path d="m9 5 7 7-7 7" />}
    {name === "check" && <path d="m5 12 4 4L19 6" />}
    {name === "radar" && <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="m12 12 7-7" /><circle cx="12" cy="12" r="1" /></>}
  </svg>;
}

function MapArtwork() {
  const blocks = Array.from({ length: 180 }, (_, n) => {
    const x = (n % 15) * 76 - 40, y = Math.floor(n / 15) * 77 - 60;
    return <rect key={n} x={x + 7} y={y + 8} width={48 + n % 3 * 5} height={46 + n % 4 * 4} rx="3" fill={n % 13 === 0 ? "#c2e5c7" : n % 7 === 0 ? "#dde7d9" : "#e3e7e5"} stroke="#d4dcda" strokeWidth=".7" />;
  });
  const minorRoads = Array.from({ length: 22 }, (_, n) => n < 12 ? <path key={n} d={`M${n * 90 - 70} -180 L${n * 90 + 180} 960`} /> : <path key={n} d={`M-160 ${(n - 12) * 95 - 20} L1180 ${(n - 12) * 95 + 150}`} />);
  const major = ["M-100 690Q240 570 440 460T1100 150", "M120 -80Q390 200 530 430T780 920", "M-100 180Q320 240 640 180T1100 220", "M-90 820Q320 700 810 680T1150 630"];
  return <svg className={s.mapArtwork} viewBox="0 0 1000 800" preserveAspectRatio="xMidYMid slice" role="img" aria-label="深圳北站周边示意底图">
    <rect width="1000" height="800" fill="#eff2ee" />
    <g transform="rotate(-14 500 400)">{blocks}</g>
    <path d="M-40 550Q10 430 90 470T170 430L230 500 190 650 60 690-40 650Z" fill="#bedfc5" stroke="#b2d7b9" />
    <path d="M710-40 890-20 940 140 860 200 740 150Z M760 760 890 680 1050 730 1020 850Z" fill="#c6e3c4" />
    <path d="M-40 700Q160 610 290 660T570 610T1040 490" fill="none" stroke="#c0dfec" strokeWidth="22" />
    <g fill="none" stroke="#d3dcd7" strokeWidth="10">{minorRoads}</g>
    <g fill="none" stroke="#fff" strokeWidth="7">{minorRoads}</g>
    <g fill="none" strokeLinecap="round"><g stroke="#dfc691" strokeWidth="20">{major.map(d => <path d={d} key={d} />)}</g><g stroke="#fff0bd" strokeWidth="15">{major.map(d => <path d={d} key={d} />)}</g><g stroke="#fff9df" strokeWidth="4">{major.map(d => <path d={d} key={d} />)}</g></g>
    <path d="M300-90Q340 220 500 420T620 900" fill="none" stroke="#d6dae4" strokeWidth="38" /><path d="M300-90Q340 220 500 420T620 900" fill="none" stroke="#fff" strokeWidth="30" />
    {[0, 8, 16].map(offset => <path key={offset} d={`M${292 + offset}-90Q${332 + offset} 220 ${492 + offset} 420T${612 + offset} 900`} fill="none" stroke="#b4bfce" strokeWidth="1.5" />)}
    <g fill="#8d99a5" stroke="#fff" strokeWidth="5" paintOrder="stroke" fontSize="24" fontWeight="600"><text x="655" y="115">龙华区</text><text x="800" y="300">民治</text><text x="760" y="620">白石龙</text><text x="160" y="305" fontSize="20">深圳北站</text><text x="164" y="333" fontSize="20">商贸区</text><text x="130" y="715" fontSize="19">深圳湾超级总部基地</text></g>
    <g fill="#a0aaae" fontSize="12"><text x="560" y="130" transform="rotate(-28 560 130)">民塘路</text><text x="720" y="480" transform="rotate(-27 720 480)">留仙大道</text><text x="220" y="170" transform="rotate(12 220 170)">新区大道</text><text x="640" y="714">玉龙路</text></g>
  </svg>;
}

export default function SearchMapDesignPreview() {
  const [query, setQuery] = useState("深圳北站");
  const [center, setCenter] = useState("深圳北站");
  const [confirmed, setConfirmed] = useState(true);
  const [radius, setRadius] = useState(3);
  const [selected, setSelected] = useState(new Set(initialCategories));
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(new Set<CategoryId>());
  const [completed, setCompleted] = useState(new Set(initialCategories));
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState<Store | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mobileView, setMobileView] = useState("list");
  const [clusterMembers, setClusterMembers] = useState<Store[]>([]);
  const [sortMode, setSortMode] = useState("distance");
  const [nav, setNav] = useState("explore");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toolbar = useRef<HTMLElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!toolbar.current?.contains(event.target as Node)) setOpenGroup(null); };
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("pointerdown", close); timers.current.forEach(clearTimeout); };
  }, []);
  useEffect(() => {
    if (active) requestAnimationFrame(() => document.getElementById(`preview-${active.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [active]);

  function cancelSearch() { generation.current++; timers.current.forEach(clearTimeout); timers.current = []; setSearching(false); }
  function changeConditions(ids: Set<CategoryId>) { cancelSearch(); setSelected(ids); setCompleted(new Set()); setActive(null); setClusterMembers([]); }
  function toggleCategory(id: CategoryId) { const ids = new Set(selected); if (ids.has(id)) ids.delete(id); else ids.add(id); changeConditions(ids); }
  function chooseStore(store: Store) { setActive(store); setExpanded(previous => new Set([...previous, store.category.id])); setClusterMembers([]); }
  function search() {
    cancelSearch(); setCompleted(new Set()); setActive(null); setClusterMembers([]); setExpanded(new Set()); setOpenGroup(null); setSearching(true);
    const version = generation.current;
    const ids = categories.filter(category => selected.has(category.id));
    ids.forEach((category, index) => timers.current.push(setTimeout(() => {
      if (version !== generation.current) return;
      setCompleted(previous => new Set([...previous, category.id]));
      if (index === ids.length - 1) setSearching(false);
    }, 500 + index * 420)));
  }
  function confirm() { if (!query.trim()) return; cancelSearch(); setCenter(query.trim()); setConfirmed(true); setCompleted(new Set()); setActive(null); setZoom(1); }
  const visibleStores = confirmed ? stores.filter(store => selected.has(store.category.id) && completed.has(store.category.id)) : [];
  const buckets = new Map<string, Store[]>();
  for (const store of visibleStores) {
    const cell = zoom < 1.5 ? `${Math.floor(store.x / 23)},${Math.floor(store.y / 23)}` : store.id;
    buckets.set(cell, [...(buckets.get(cell) ?? []), store]);
  }

  return <main className={s.preview}>
    <div className={s.body}>
      <aside className={s.sidebar} aria-label="预览导航"><div className={s.sidebarStart}>
        <Link href="/ui-preview/search-map" className={s.brand}><span><Icon name="pin" /></span><strong>地点周边</strong></Link><nav>
        <button type="button" className={nav === "explore" ? s.navActive : ""} onClick={() => setNav("explore")}><GlyphIcon name="compass" /><span>探索附近</span></button>
        <button type="button" className={nav === "history" ? s.navActive : ""} onClick={() => setNav("history")}><Icon name="clock" /><span>最近搜索</span></button>
        <button type="button" className={nav === "personal" ? s.navActive : ""} onClick={() => setNav("personal")}><Icon name="person" /><span>个人中心</span></button>
      </nav></div><div className={s.sidebarBottom}><div className={s.workspaceCard}><span className={s.workspaceAvatar}>N</span><div><strong>附近生活工作台</strong><span className={s.version}>DESIGN PREVIEW</span></div></div><Link href="/" className={s.backLink}>返回工作台 ↗</Link></div></aside>
      {nav !== "explore" ? <section className={s.secondary}><Icon name={nav === "history" ? "clock" : "person"} /><h1>{nav === "history" ? "最近搜索" : "个人中心"}</h1><p>这份测试版重点展示搜索与地图交互。</p><button type="button" onClick={() => setNav("explore")}>回到探索附近</button></section> : <div className={s.workspace}>
        <div className={s.heading}>
          <div className={s.title}><h1>探索附近</h1><p>以当前地点为中心，发现步行可达的精彩地点</p></div>
          <form className={s.searchbox} onSubmit={event => { event.preventDefault(); confirm(); }}><Icon name="pin" /><input aria-label="搜索地点" value={query} onChange={event => { cancelSearch(); setQuery(event.target.value); setConfirmed(false); setCompleted(new Set()); setActive(null); }} placeholder="输入地点名称" /><button type="button" className={s.clear} aria-label="清空地点" onClick={() => { setQuery(""); setConfirmed(false); setCompleted(new Set()); cancelSearch(); }}>×</button><button type="submit" className={s.pinkButton}><Icon name="search" />确认地点</button></form>
          <span className={s.centerChip} data-confirmed={confirmed}><span>{confirmed ? "✓" : "○"}</span>{confirmed ? center + " · 已确认" : "请先确认地点"}</span>
          <span className={s.avatar}>N</span>
        </div>
        <section ref={toolbar} className={s.toolbar} aria-label="搜索条件" onKeyDown={event => {
          if (event.key === "Escape") { toolbar.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus(); setOpenGroup(null); }
        }}>
          <div className={s.groupButtons}>{groups.map(group => <div className={s.group} key={group.id}>
            <button type="button" className={s.groupButton} style={{ "--group-color": group.color } as CSSProperties} aria-expanded={openGroup === group.id} aria-controls={`preview-group-${group.id}`} onClick={() => setOpenGroup(current => current === group.id ? null : group.id)}><GlyphIcon name={group.glyph} /><strong>{group.label}</strong><span>{group.ids.filter(id => selected.has(id)).length}/{group.ids.length}</span><span className={s.caret} data-open={openGroup === group.id}>⌄</span></button>
            <div className={s.dropdown} id={`preview-group-${group.id}`} hidden={openGroup !== group.id}><label className={s.wholeGroup}><input type="checkbox" checked={group.ids.every(id => selected.has(id))} onChange={() => { const ids = new Set(selected); const remove = group.ids.every(id => ids.has(id)); group.ids.forEach(id => remove ? ids.delete(id) : ids.add(id)); changeConditions(ids); }} />整组选择</label>{group.ids.map(id => <label key={id}><input type="checkbox" checked={selected.has(id)} onChange={() => toggleCategory(id)} />{categories.find(category => category.id === id)!.label}</label>)}</div>
          </div>)}</div>
          <fieldset className={s.radius}><legend className={s.srOnly}>搜索半径</legend>{[1, 2, 3, 5].map(value => <label key={value}><input type="radio" name="preview-radius" value={value} checked={radius === value} onChange={() => { cancelSearch(); setRadius(value); setCompleted(new Set()); setActive(null); }} /><span>{value} 公里</span></label>)}</fieldset>
          <button type="button" className={s.pinkButton} disabled={!confirmed || !selected.size || searching} onClick={search}><Icon name="search" />{searching ? "探索中…" : "搜索附近"}</button>
        </section>
        <div className={s.mobileSwitch} role="group" aria-label="显示方式"><button type="button" aria-pressed={mobileView === "list"} onClick={() => setMobileView("list")}>附近结果</button><button type="button" aria-pressed={mobileView === "map"} onClick={() => setMobileView("map")}>附近地图</button></div>
        <div className={s.columns} data-mobile-view={mobileView}>
          <section className={s.results} aria-label="附近结果"><header className={s.resultsHeading}><div><span className={s.radarIcon}><GlyphIcon name="radar" /></span><h2>附近结果</h2></div><span className={s.resultStatus}><i />{searching ? "搜索中" : `已返回 ${completed.size} / ${selected.size} 类`}</span></header>
            <div className={s.resultScroll}>
              {!confirmed ? <div className={s.empty}><Icon name="pin" /><h3>先确认一个搜索中心</h3><p>输入地点，让附近的精彩在地图上展开。</p></div> : !visibleStores.length && !searching ? <div className={s.empty}><GlyphIcon name="compass" /><h3>从这里开始探索</h3><p>选好类别和范围，点击“搜索附近”。</p></div> : categories.filter(category => selected.has(category.id)).map(category => {
                const isOpen = expanded.has(category.id), done = completed.has(category.id);
                const rows = stores.filter(store => store.category.id === category.id).sort((a,b) => sortMode === "rating" ? b.rating - a.rating : a.distance - b.distance);
                return <section className={s.categoryResult} key={category.id}><h3><button type="button" className={s.categoryHeading} aria-expanded={isOpen} aria-controls={`preview-results-${category.id}`} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })}>
                  <span className={s.categoryIcon} style={{ "--category-color": category.color } as CSSProperties}><GlyphIcon name={category.id} /></span><strong>{category.label}</strong>{done && <span className={s.categoryCount}>3 个地点</span>}<span className={s.categoryState} data-done={done}>{done ? <><GlyphIcon name="check" />已完成</> : searching ? "搜索中…" : "等待搜索"}</span><GlyphIcon name="chevron" className={isOpen ? s.chevronOpen : ""} />
                </button></h3><div id={`preview-results-${category.id}`} hidden={!isOpen} className={s.categoryBody}>
                  {done ? <><label className={s.sort}>排序<select aria-label={`${category.label}排序`} value={sortMode} onChange={event => setSortMode(event.target.value)}><option value="distance">距离最近</option><option value="rating">评分最高</option></select></label>{rows.map(store => <button id={`preview-${store.id}`} type="button" key={store.id} className={s.storeRow} data-selected={active?.id === store.id} onClick={() => chooseStore(store)} onFocus={() => setActive(store)} onMouseEnter={() => setActive(store)}><Icon name="pin" /><span><strong>{store.name}</strong><span>{store.distance}m <b>·</b> 评分 {store.rating}</span></span><GlyphIcon name="chevron" /></button>)}</> : <p className={s.waiting}>{searching ? "正在探索这一类附近地点…" : "开始搜索后，地点将在这里出现。"}</p>}
                </div></section>;
              })}
            </div><footer className={s.resultsFooter}><span><i className={searching ? s.spinning : ""} />{searching ? "更多附近发现正在到达…" : `已获取 ${visibleStores.length} 个示例地点`}</span><span>点击类别展开</span></footer>
          </section>
          <section className={s.map} aria-label="附近地图">
            {!confirmed ? <div className={s.mapEmpty}><div><Icon name="pin" /></div><h2>下一站，就在附近</h2><p>确认地点后，地图将为你展开。</p></div> : <>
              <div className={s.mapWorld} style={{ transform: `scale(${zoom})` }}><MapArtwork /><div className={s.rangeCircle} style={{ width: `${Math.min(90, radius * 24)}%` }}>{[.33, .66].map(scale => <div className={s.innerRing} key={scale} style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }} />)}{searching && <div className={s.scanner} />}</div>
              {[...buckets.entries()].map(([key, members]) => {
                const x = members.reduce((sum, store) => sum + store.x, 0) / members.length, y = members.reduce((sum, store) => sum + store.y, 0) / members.length;
                const single = members.length === 1, store = members[0]!;
                return <button type="button" key={key} className={s.mapMarker} data-selected={active && members.some(item => item.id === active.id) ? "true" : "false"} data-cluster={!single} style={{ left: `${x}%`, top: `${y}%`, "--pin-color": single ? store.category.color : "#c8a2ff" } as CSSProperties} aria-label={single ? `定位${store.name}` : `展开附近 ${members.length} 个地点`} onClick={() => {
                  if (single) chooseStore(store); else { setClusterMembers(members); setZoom(current => Math.min(2, current + .35)); }
                }}>{single ? <GlyphIcon name={store.category.id} /> : <strong>{members.length}</strong>}</button>;
              })}
              {active && <div className={s.selectedMapPoint} style={{ left: `${active.x}%`, top: `${active.y}%` }}><span className={s.selectedLabel}>{active.name}<span>{active.distance}m</span></span><span style={{ background: active.category.color }}><GlyphIcon name={active.category.id} /></span></div>}
              <div className={s.centerPin}><span><Icon name="pin" /></span><strong>{center}</strong></div></div>
              <div className={s.mapStatus}><span className={s.radarIcon}><GlyphIcon name="radar" /></span><div><strong>附近雷达</strong><span><i />{searching ? "周边扫描中…" : visibleStores.length ? "附近好去处，已为你点亮" : "准备探索周边"}</span></div></div>
              <span className={s.mapRadius}><span />{radius} 公里范围</span>
              <div className={s.mapControls}><div><button type="button" aria-label="放大地图" onClick={() => setZoom(current => Math.min(2, current + .25))}>＋</button><button type="button" aria-label="缩小地图" onClick={() => { setZoom(current => Math.max(.8, current - .25)); setClusterMembers([]); }}>−</button></div><button type="button" aria-label="回到搜索中心" onClick={() => { setZoom(1); setActive(null); setClusterMembers([]); }}><GlyphIcon name="radar" /></button></div>
              <div className={s.mapLegend}>{categories.filter(category => selected.has(category.id) && completed.has(category.id)).map(category => <span key={category.id}><i style={{ background: category.color }} />{category.label}</span>)}</div><span className={s.mapCaption}>示意地图 · 示例地点</span>
              {clusterMembers.length > 0 && <div className={s.clusterPopover}><header><strong>这附近的 {clusterMembers.length} 个地点</strong><button type="button" aria-label="关闭聚合地点" onClick={() => setClusterMembers([])}>×</button></header>{clusterMembers.map(store => <button type="button" key={store.id} onClick={() => chooseStore(store)}><span style={{ background: store.category.color }}><GlyphIcon name={store.category.id} /></span>{store.name}<GlyphIcon name="chevron" /></button>)}</div>}
            </>}
          </section>
        </div>
        <div className={s.reviewFooter}><span>交互测试版：可体验分类选择、范围调整、雷达搜索和地图联动。</span><button type="button" onClick={() => { cancelSearch(); setConfirmed(false); setCompleted(new Set()); setActive(null); setExpanded(new Set()); }}>重新体验地点确认</button></div>
      </div>}
    </div>
  </main>;
}
