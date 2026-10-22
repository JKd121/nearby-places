import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeading } from "../../src/components/page-heading";
import { Button } from "../../src/components/ui/button";

export const metadata: Metadata = { title: "我的地点" };

export default function MyPlacesPage() {
  return <div className="content-page places-page">
    <PageHeading title="我的地点" description="收藏与清单尚未开放。" />
    <section className="places-empty" aria-labelledby="places-empty-title"><h2 id="places-empty-title">当前还不能保存地点</h2><p>你可以先探索附近，或从历史记录继续搜索。</p><div className="places-actions"><Button asChild><Link href="/explore">开始探索 <ArrowRight aria-hidden="true" /></Link></Button><Link className="text-link" href="/history">查看搜索历史</Link></div></section>
  </div>;
}
