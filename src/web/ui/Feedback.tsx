import type { ReactNode } from "react";
import styles from "../search-workspace.module.css";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "error" | "accent" }) {
  return <span className={styles.badge} data-tone={tone}>{children}</span>;
}

export function Feedback({ title, children, tone = "info", action }: { title: string; children?: ReactNode; tone?: "info" | "warning" | "error"; action?: ReactNode }) {
  return <div className={styles.feedback} data-tone={tone} role={tone === "error" ? "alert" : "status"}>
    <span className={styles.feedbackSymbol} aria-hidden="true">{tone === "error" || tone === "warning" ? "!" : "i"}</span>
    <div><strong>{title}</strong>{children && <div className={styles.feedbackBody}>{children}</div>}{action && <div className={styles.feedbackAction}>{action}</div>}</div>
  </div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={styles.emptyState}><span className={styles.emptyMark} aria-hidden="true"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></svg></span><h3>{title}</h3><p>{children}</p></div>;
}

export function LoadingState({ children }: { children: ReactNode }) {
  return <div role="status" className={styles.loadingState}><p>{children}</p><div className={styles.skeletons} aria-hidden="true">{[1, 2, 3].map((item) => <div key={item}><span /><span /></div>)}</div></div>;
}
