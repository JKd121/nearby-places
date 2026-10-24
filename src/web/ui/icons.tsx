export type IconName = "pin" | "search" | "clock" | "person" | "panel" | "arrow" | "settings";

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "pin" && <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>}
    {name === "search" && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>}
    {name === "clock" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5h4" /></>}
    {name === "person" && <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>}
    {name === "panel" && <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16m6-11-3 3 3 3" /></>}
    {name === "arrow" && <><path d="M5 12h14m-6-6 6 6-6 6" /></>}
    {name === "settings" && <><path d="m9.5 3-.6 2.1-1.3.8-2.1-.5L3 9.6l1.5 1.6v1.6L3 14.4l2.5 4.2 2.1-.5 1.3.8.6 2.1h5l.6-2.1 1.3-.8 2.1.5 2.5-4.2-1.5-1.6v-1.6L21 9.6l-2.5-4.2-2.1.5-1.3-.8-.6-2.1Z" /><circle cx="12" cy="12" r="3" /></>}
  </svg>;
}
