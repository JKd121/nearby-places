import type { Metadata } from "next";
import SearchApp from "../../src/web/SearchApp";

export const metadata: Metadata = { title: "探索地点" };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ history?: string | string[] }> }) {
  const params = await searchParams;
  const replayHistoryId = typeof params.history === "string" ? params.history : undefined;
  return <SearchApp replayHistoryId={replayHistoryId} />;
}
