import type { Metadata } from "next";
import SearchMapDesignPreview from "./preview";

export const metadata: Metadata = { title: "搜索地图设计测试版 · 地点周边", robots: { index: false, follow: false } };
export default function Page() { return <SearchMapDesignPreview />; }
