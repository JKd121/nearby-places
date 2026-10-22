"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock3, History, MapPin, RotateCcw, Trash2 } from "lucide-react";
import { useSearchHistory } from "../web/useSearchHistory";
import { Button } from "./ui/button";

export function RecentHistory({ compact = false }: { compact?: boolean }) {
  const history = useSearchHistory();
  const items = compact ? history.items.slice(0, 3) : history.items;
  const busy = !history.hasLoaded && !history.loadError;
  return <section className="activity-section" aria-label={compact ? "最近探索" : "最近搜索记录"}>
    <div className="section-heading"><div><h2>{compact ? "继续上次的探索" : "最近搜索"}</h2><p>{compact ? "熟悉的起点，也可以有新的发现。" : "展示本浏览器最近 10 条完整记录，按最近使用时间排列。"}</p></div>
      {compact ? <Link className="text-link" href="/history">查看历史 <ArrowUpRight aria-hidden="true" /></Link> : <Button variant="outline" size="sm" disabled={history.loading} onClick={() => void history.refresh(true)}><RotateCcw aria-hidden="true" />{history.loading ? "刷新中…" : "刷新"}</Button>}
    </div>
    {history.loadError && <div className="feedback-banner" role="alert"><p>{history.loadError}</p><Button variant="outline" size="sm" disabled={history.loading} onClick={() => void history.refresh(true)}>重试</Button></div>}
    {history.deleteError && <p className="feedback-error" role="alert">{history.deleteError}</p>}
    {busy && <div className="activity-loading" role="status"><Clock3 aria-hidden="true" /><p>正在读取最近探索…</p></div>}
    {!busy && items.length === 0 && !history.loadError && <div className="activity-empty">
      <div className="empty-icon"><History aria-hidden="true" /></div><div><h3>{history.pendingDeleteCount ? "正在同步删除…" : history.hasMore ? "正在读取更多记录…" : "探索，从第一次出发开始"}</h3><p>完成一次地点搜索后，你可以在这里找回原来的地点和搜索条件。</p></div><Link href="/explore" className="text-link">开始探索 <ArrowRight aria-hidden="true" /></Link>
    </div>}
    {items.length > 0 && <ol className="activity-list">{items.map((item) => <li key={item.id} className="activity-row">
      <span className="activity-location-icon"><MapPin aria-hidden="true" /></span>
      <Link className="activity-replay" href={`/explore?history=${encodeURIComponent(item.id)}`} aria-label={`继续探索：${item.confirmedLocation.name}`}>
        <strong>{item.confirmedLocation.name}</strong><span>{item.confirmedLocation.address || [item.confirmedLocation.city, item.confirmedLocation.district].filter(Boolean).join(" · ") || "地址暂无"}</span>
        <small>{item.categoryIds.length} 个类别 · {item.radiusMeters / 1000} km<span className="activity-date"> · <time dateTime={item.searchedAt}>{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", timeZone: "Asia/Shanghai" }).format(new Date(item.searchedAt))}</time></span></small>
      </Link>
      {!compact && <Button variant="ghost" size="icon" className="history-delete-action" aria-label={`删除搜索历史：${item.confirmedLocation.name}`} onClick={(event) => {
        const row = event.currentTarget.closest("li");
        const next = row?.nextElementSibling ?? row?.previousElementSibling;
        (next?.querySelector<HTMLAnchorElement>("a") ?? document.querySelector<HTMLButtonElement>(".activity-section .ui-button"))?.focus();
        void history.remove(item.id);
      }}><Trash2 aria-hidden="true" /></Button>}
      <Link className="activity-continue" href={`/explore?history=${encodeURIComponent(item.id)}`} aria-label={`用原条件搜索：${item.confirmedLocation.name}`}><span>继续探索</span><ArrowUpRight aria-hidden="true" /></Link>
    </li>)}</ol>}
    {!compact && <p className="history-footnote">历史保存在当前浏览器的访客身份下。继续探索会使用原来的中心和条件，重新查询最新结果。</p>}
  </section>;
}
