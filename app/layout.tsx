import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "../src/components/app-shell";

export const metadata: Metadata = { title: { default: "Nearby · 发现下一处", template: "%s · Nearby" }, description: "从一个地点出发，探索附近值得去的地方。" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AppShell>{children}</AppShell></body></html>;
}
