import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "地点周边", description: "搜索地点周边生活服务" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
