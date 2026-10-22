"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Compass, FolderHeart, History, House, MapPin, MoveUpRight } from "lucide-react";
import { Sidebar, SidebarProvider, SidebarTrigger, useSidebar } from "./ui/sidebar";

const pages = [
  { href: "/", title: "首页", english: "Home", icon: House },
  { href: "/explore", title: "探索地点", english: "Explore", icon: Compass },
  { href: "/my-places", title: "我的地点", english: "My Places", icon: FolderHeart },
  { href: "/history", title: "搜索历史", english: "History", icon: History },
];

function Navigation() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return <>
    <div className="sidebar-section-label">你的探索空间</div>
    <nav aria-label="主导航" className="sidebar-nav">{pages.map(({ href, title, english, icon: Icon }) =>
      <Link href={href} key={href} className="sidebar-link" aria-current={pathname === href ? "page" : undefined} onClick={() => setOpenMobile(false)} title={title}>
        <Icon aria-hidden="true" /><span className="sidebar-link-copy"><strong>{title}</strong><small>{english}</small></span><MoveUpRight className="sidebar-link-arrow" aria-hidden="true" />
      </Link>)}
    </nav>
    <div className="sidebar-note"><Compass aria-hidden="true" /><p>给周末留一点<br />新的可能。</p><Link href="/explore" onClick={() => setOpenMobile(false)}>从一个地点开始 <ArrowUpRight aria-hidden="true" /></Link></div>
    <div className="sidebar-footer"><span className="visitor-dot" /><span>匿名探索 · 当前浏览器</span></div>
  </>;
}

function ShellContents({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pages.find((page) => page.href === pathname);
  return <>
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <header className="app-header">
      <div className="header-brand"><SidebarTrigger /><Link href="/" className="brand" aria-label="Nearby 首页"><span className="brand-symbol"><MapPin aria-hidden="true" /></span>nearby<span className="brand-period">.</span></Link></div>
      <div className="header-context"><span>个人地点探索工作台</span><span className="header-divider" /><strong>{current?.title ?? "Nearby"}</strong></div>
      <div className="visitor-label"><span className="visitor-dot" />访客模式</div>
    </header>
    <div className="app-body"><Sidebar><Navigation /></Sidebar><main id="main-content" className="app-main" tabIndex={-1}>{children}</main></div>
  </>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <SidebarProvider><ShellContents>{children}</ShellContents></SidebarProvider>;
}
