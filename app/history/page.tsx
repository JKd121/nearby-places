import type { Metadata } from "next";
import { PageHeading } from "../../src/components/page-heading";
import { RecentHistory } from "../../src/components/recent-history";

export const metadata: Metadata = { title: "搜索历史" };

export default function HistoryPage() {
  return <div className="content-page history-page"><PageHeading title="接着上次，继续发现。" description="找回熟悉的起点，看看今天有什么新去处。" /><RecentHistory /></div>;
}
