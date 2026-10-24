import type { Metadata } from "next";
import NavigationPreview from "./NavigationPreview";

export const metadata: Metadata = {
  title: "导航外壳预览 · 地点周边",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <NavigationPreview />;
}
