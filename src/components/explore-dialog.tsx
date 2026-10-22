"use client";

import type { ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "./ui/button";

export function ExploreDialog({ open, onOpenChange, title, description, children, onCloseAutoFocus, footer }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  onCloseAutoFocus: (event: Event) => void;
  footer?: ReactNode;
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
    <Dialog.Overlay className="explore-dialog-overlay" />
    <Dialog.Content className="explore-dialog" onCloseAutoFocus={onCloseAutoFocus}>
      <header className="explore-dialog-header"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label={`关闭${title}`}><X aria-hidden="true" /></Button></Dialog.Close></header>
      <div className="explore-dialog-body">{children}</div>
      {footer && <footer className="explore-dialog-footer">{footer}</footer>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
