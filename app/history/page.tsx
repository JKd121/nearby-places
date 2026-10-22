import type { Metadata } from "next";
import { PageHeading } from "../../src/components/page-heading";
import { RecentHistory } from "../../src/components/recent-history";

export const metadata: Metadata = { title: "搜索历史" };

export default function HistoryPage() {
  return <div className="content-page history-page"><PageHeading title="搜索历史" description="用原来的地点与条件，重新搜索最新结果。" /><RecentHistory /></div>;
}
