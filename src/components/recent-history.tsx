"use client";

import Link from "next/link";
import { ArrowRight, Clock3, RotateCcw, Trash2 } from "lucide-react";
import { useSearchHistory } from "../web/useSearchHistory";
import { Button } from "./ui/button";

export function RecentHistory({ compact = false }: { compact?: boolean }) {
  const history = useSearchHistory();
  const items = compact ? history.items.slice(0, 3) : history.items;
  const busy = !history.hasLoaded && !history.loadError;
  return <section className="activity-section" aria-label={compact ? "最近探索" : "最近搜索记录"}>
    <div className="section-heading"><div><h2>{compact ? "最近探索" : "最近搜索"}</h2>{!compact && <p>本浏览器最近 10 条完整记录，按最近使用时间排列。</p>}</div>
      {compact ? <Link className="text-link" href="/history">查看历史 <ArrowRight aria-hidden="true" /></Link> : <Button variant="outline" size="sm" disabled={history.loading} onClick={() => void history.refresh(true)}><RotateCcw aria-hidden="true" />{history.loading ? "刷新中…" : "刷新"}</Button>}
    </div>
    {history.loadError && <div className="feedback-banner" role="alert"><p>{history.loadError}</p><Button variant="outline" size="sm" disabled={history.loading} onClick={() => void history.refresh(true)}>重试</Button></div>}
    {history.deleteError && <p className="feedback-error" role="alert">{history.deleteError}</p>}
    {busy && <div className="activity-loading" role="status"><Clock3 aria-hidden="true" /><p>正在读取最近探索…</p></div>}
    {!busy && items.length === 0 && !history.loadError && <div className="activity-empty"><h3>{history.pendingDeleteCount ? "正在同步删除…" : history.hasMore ? "正在读取更多记录…" : "还没有搜索记录"}</h3><p>完成一次附近搜索后，地点与搜索条件会显示在这里。</p><Link href="/explore" className="text-link">开始探索 <ArrowRight aria-hidden="true" /></Link></div>}
    {items.length > 0 && <ol className="activity-list">{items.map((item) => <li key={item.id} className="activity-row">
      <Link className="activity-replay" href={"/explore?history=" + encodeURIComponent(item.id)} aria-label={"继续探索：" + item.confirmedLocation.name}>
        <span className="activity-record"><strong>{item.confirmedLocation.name}</strong><span>{item.confirmedLocation.address || [item.confirmedLocation.city, item.confirmedLocation.district].filter(Boolean).join(" · ") || "地址暂无"}</span>
          <small>{item.categoryIds.length} 个类别 · {item.radiusMeters / 1000} km · <time dateTime={item.searchedAt}>{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", timeZone: "Asia/Shanghai" }).format(new Date(item.searchedAt))}</time></small>
        </span>
        <span className="activity-continue"><span>继续探索</span><ArrowRight aria-hidden="true" /></span>
      </Link>
      {!compact && <Button variant="ghost" size="icon" className="history-delete-action" aria-label={"删除搜索历史：" + item.confirmedLocation.name} onClick={(event) => {
        const row = event.currentTarget.closest("li");
        const next = row?.nextElementSibling ?? row?.previousElementSibling;
        (next?.querySelector<HTMLAnchorElement>("a") ?? document.querySelector<HTMLButtonElement>(".activity-section .ui-button"))?.focus();
        void history.remove(item.id);
      }}><Trash2 aria-hidden="true" /></Button>}
    </li>)}</ol>}
    {!compact && <p className="history-footnote">历史关联当前浏览器的访客身份。继续探索会恢复原来的地点、类别与半径。</p>}
  </section>;
}
