import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bookmark, FolderHeart, Search } from "lucide-react";
import { PageHeading } from "../../src/components/page-heading";
import { Button } from "../../src/components/ui/button";

export const metadata: Metadata = { title: "我的地点" };

export default function MyPlacesPage() {
  return <div className="content-page places-page">
    <PageHeading title="给喜欢的地方，留个位置。" description="你的地点收藏空间。" />
    <div className="places-section-heading"><h2><FolderHeart aria-hidden="true" />地点收藏</h2><span className="availability-label">收藏功能尚未开放</span></div>
    <section className="places-empty" aria-labelledby="places-empty-title"><div className="collection-outline"><Bookmark aria-hidden="true" /></div><h3 id="places-empty-title">未来想再去的地方，都放在这里。</h3><p>收藏与清单功能正在准备中，当前还不能保存地点。<br />你可以先去探索，或从搜索历史继续上次的发现。</p><Button asChild><Link href="/explore"><Search aria-hidden="true" />先去探索附近</Link></Button><Link className="text-link" href="/history">找回最近搜索 <ArrowRight aria-hidden="true" /></Link></section>
    <div className="places-note"><Bookmark aria-hidden="true" /><p>出发之前，先遇见喜欢。<span>搜索历史会记录已完成的探索，方便下次继续。</span></p></div>
  </div>;
}
