import type { CategoryKey, Place } from "../amap/types";
import type { LocationCandidate } from "../location/types";
import type { SearchHistoryItem } from "./search-history-store";
import type { useSearchHistory } from "./useSearchHistory";
import { CATEGORIES } from "../amap/categories";
import { buildAmapMarkerUrl } from "./location-links";
import { ALL_CATEGORY_IDS, CATEGORY_GROUPS, clearCategories, formatCost, formatDistance, formatRating, getBusinessHoursDisplay, getGroupSelection, getPlaceRenderKey, isTransitCategory, selectAllCategories, toggleCategory, toggleGroup, truncateTag } from "./logic";
import { Badge, EmptyState, Feedback, LoadingState } from "./ui/Feedback";
import { Icon } from "./ui/icons";
import s from "./search-workspace.module.css";

export function categoryLabel(key: CategoryKey): string { return CATEGORIES.find((category) => category.key === key)?.label ?? key; }

export function CandidateList({ candidates, expanded, onExpand, onSelect }: { candidates: readonly LocationCandidate[]; expanded: boolean; onExpand: () => void; onSelect: (candidate: LocationCandidate) => void }) {
  return <><ol className={s.candidateList}>{(expanded ? candidates : candidates.slice(0, 5)).map((candidate, index) => <li key={`${candidate.id ?? candidate.name}-${index}`}>
    <button type="button" className={s.candidate} onClick={() => onSelect(candidate)} aria-label={`选用此地点：${candidate.name}`}>
      <span className={s.index}>{index + 1}</span><span className={s.candidateCopy}><strong>{candidate.name}</strong>{candidate.placeType && <span className={s.smallType}>{candidate.placeType}</span>}<span>{[candidate.city, candidate.district].filter(Boolean).join(" · ") || "行政区未知"}</span>{candidate.address && <span>{candidate.address}</span>}</span><span className={s.choose}>选用此地点 <Icon name="arrow" /></span>
    </button>
  </li>)}</ol>{!expanded && candidates.length > 5 && <div className={s.listFooter}><button type="button" onClick={onExpand}>查看更多地点（共 {candidates.length} 个）</button></div>}</>;
}

export function CategorySelector({ selected, onChange }: { selected: readonly CategoryKey[]; onChange: (next: CategoryKey[]) => void }) {
  return <fieldset className={s.categorySelector}><legend>服务类别</legend><div className={s.selectionActions}><span>{selected.length}/{ALL_CATEGORY_IDS.length} 已选</span><div><button type="button" onClick={() => onChange(selectAllCategories())}>全选</button><button type="button" onClick={() => onChange(clearCategories())}>清空</button></div></div>
    <div className={s.categoryGroups}>{CATEGORY_GROUPS.map((group) => { const selection = getGroupSelection(selected, group.categoryIds); return <div className={s.categoryGroup} key={group.key}>
      <div className={s.groupTitle}><strong>{group.label}</strong><button type="button" aria-label={`${selection === "all" ? "取消" : "选中"}${group.label}整组`} aria-pressed={selection === "all"} onClick={() => onChange(toggleGroup(selected, group.categoryIds))}>{selection === "all" ? "取消整组" : "选中整组"}</button></div>
      <div className={s.checkboxes}>{group.categoryIds.map((key) => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => onChange(toggleCategory(selected, key))} />{categoryLabel(key)}</label>)}</div>
    </div>; })}</div>
  </fieldset>;
}

export function PlaceList({ places }: { places: Place[] }) {
  return <ol className={s.placeList}>{places.map((place, index) => {
    const cost = formatCost(place.category, place.cost), tag = truncateTag(place.tag), transit = isTransitCategory(place.category);
    const url = buildAmapMarkerUrl({ ...place, preferPoiId: transit });
    return <li className={s.place} key={getPlaceRenderKey(place, index)}><span className={s.index}>{index + 1}</span><div className={s.placeCopy}>
      <div className={s.placeTitle}><div><h3>{place.name}</h3><Badge>{categoryLabel(place.category)}</Badge></div><strong className={s.distance}>{formatDistance(place.distanceMeters)}</strong></div>
      {!transit && ((place.rating !== null && Number.isFinite(place.rating)) || cost) && <p className={s.metadata}>{place.rating !== null && Number.isFinite(place.rating) && <span>{formatRating(place.rating)}</span>}{cost && <span>{cost}</span>}</p>}
      {tag && <p className={s.muted}>{tag}</p>}{!transit && <p className={s.muted}>{getBusinessHoursDisplay(place)}</p>}
      <div className={s.placeBottom}><p>{place.address || "地址暂无"}</p>{url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={transit ? `在高德查看站点详情「${place.name}」` : `在高德地图查看「${place.name}」的位置`}>{transit ? "在高德查看站点详情" : "查看位置"}<Icon name="arrow" /></a>}</div>
    </div></li>;
  })}</ol>;
}

export function HistoryView({ history, onSelect, onDelete }: { history: ReturnType<typeof useSearchHistory>; onSelect: (item: SearchHistoryItem) => void; onDelete: (id: string, button: HTMLButtonElement) => void }) {
  return <div className={s.secondaryView}><header className={s.pageTitle}><div><h1>最近搜索</h1><p>点击地点，沿用原中心和条件重新搜索。</p></div><Badge>最近 {history.items.length} 条</Badge></header>
    <section className={s.historyPanel} aria-label="搜索历史">
      {history.loadError && <Feedback tone="error" title="最近搜索读取失败" action={<button type="button" onClick={() => void history.refresh(true)} disabled={history.loading}>重试</button>}>{history.loadError}</Feedback>}
      {history.deleteError && <Feedback tone="error" title="删除未完成">{history.deleteError}</Feedback>}
      {!history.hasLoaded && history.items.length === 0 && !history.loadError ? <LoadingState>正在读取最近搜索…</LoadingState> : history.items.length === 0 && !history.loadError ? (history.pendingDeleteCount > 0 || history.hasMore ? <LoadingState>正在同步历史记录…</LoadingState> : <EmptyState title="暂无搜索历史">完成一次附近搜索后，就可以在这里再次探索。</EmptyState>) : null}
      <ul className={s.historyList}>{history.items.map((item) => <li className={s.historyRow} key={item.id}><span className={s.historyIcon}><Icon name="clock" /></span><button type="button" className={s.historyItem} onClick={() => onSelect(item)}><strong>{item.confirmedLocation.name}</strong>{item.confirmedLocation.address && <span>{item.confirmedLocation.address}</span>}<span>{item.categoryIds.length} 个类别 · {item.radiusMeters / 1000} km</span></button><button data-history-delete type="button" className={s.deleteButton} aria-label={`删除这条搜索历史：${item.confirmedLocation.name}`} onClick={(event) => onDelete(item.id, event.currentTarget)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button></li>)}</ul>
    </section>
  </div>;
}

export function PersonalCenter() {
  return <div className={s.secondaryView}><header className={s.pageTitle}><div><h1>个人中心</h1><p>功能建设中，以下为布局预览。</p></div><Badge tone="warning">静态展示</Badge></header><div className={s.personalGrid}>
    <section className={s.personalCard}><h2>访客概览</h2><div className={s.visitor}><span><Icon name="person" /></span><strong>访客</strong><Badge tone="success">未关联账号</Badge><p>这里将展示个人信息</p></div></section>
    <section className={s.personalCard}><h2>个人资料</h2><dl className={s.profileFields}>{[["昵称", "未设置"], ["邮箱", "未关联"], ["所在城市", "未设置"], ["个人简介", "暂未填写"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
  </div><section className={s.personalCard}><h2>偏好区域预留</h2>{[["界面主题", "当前风格"], ["语言显示", "简体中文"], ["其他偏好", "后续开放"]].map(([label, value]) => <div className={s.preference} key={label}><strong>{label}</strong><span>{value}</span><Badge>尚未开放</Badge></div>)}</section><p className={s.muted}>此页面仅为布局预览，暂不提供资料保存或设置操作。</p></div>;
}
