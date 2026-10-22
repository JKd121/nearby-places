"use client";

import * as React from "react";
import { Dialog } from "radix-ui";
import { PanelLeftClose, PanelLeftOpen, Menu, X } from "lucide-react";
import { Button } from "./button";

// Narrow adaptation of shadcn/ui SidebarProvider and mobile Sheet (MIT).
// Full source/provenance: THIRD_PARTY_NOTICES.md. No demo/account data.
type SidebarState = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
};
const SidebarContext = React.createContext<SidebarState | null>(null);

export function useSidebar() {
  const value = React.useContext(SidebarContext);
  if (!value) throw new Error("Sidebar requires SidebarProvider");
  return value;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  const [openMobile, setOpenMobile] = React.useState(false);
  const value = React.useMemo(() => ({ open, setOpen, openMobile, setOpenMobile }), [open, openMobile]);
  return <SidebarContext.Provider value={value}><div className="app-shell" data-sidebar-state={open ? "expanded" : "collapsed"}>{children}</div></SidebarContext.Provider>;
}

export function SidebarTrigger() {
  const { open, setOpen, openMobile, setOpenMobile } = useSidebar();
  return <>
    <Button className="desktop-sidebar-trigger" variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label={open ? "收起侧边栏" : "展开侧边栏"} aria-expanded={open} aria-controls="desktop-sidebar">
      {open ? <PanelLeftClose /> : <PanelLeftOpen />}
    </Button>
    <Button className="mobile-sidebar-trigger" variant="ghost" size="icon" onClick={() => setOpenMobile(!openMobile)} aria-label="打开导航菜单" aria-expanded={openMobile} aria-controls="mobile-navigation">
      <Menu />
    </Button>
  </>;
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  const { openMobile, setOpenMobile } = useSidebar();
  return <>
    <aside id="desktop-sidebar" className="app-sidebar">{children}</aside>
    <Dialog.Root open={openMobile} onOpenChange={setOpenMobile}>
      <Dialog.Portal>
        <Dialog.Overlay className="sidebar-overlay" />
        <Dialog.Content id="mobile-navigation" className="mobile-sidebar" onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLButtonElement>(".mobile-sidebar-trigger")?.focus();
        }}>
          <div className="mobile-sidebar-heading"><Dialog.Title>Nearby 导航</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭导航菜单"><X /></Button></Dialog.Close></div>
          <Dialog.Description className="sr-only">选择页面，继续你的地点探索。</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
