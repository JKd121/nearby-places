"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import styles from "./workspace.module.css";

export type WorkspaceView = "explore" | "history" | "personal";


const views = {
  explore: { label: "探索附近", group: "工作空间", icon: "search", title: "搜索工作区", description: "地点输入、候选确认和附近结果将在下一步放进这里。" },
  history: { label: "最近搜索", group: "工作空间", icon: "clock", title: "最近搜索内容区", description: "这里将展示最近搜索。这一版先体验导航切换，暂未读取历史记录。" },
  personal: { label: "个人中心", group: "个人空间", icon: "person", title: "个人空间内容区", description: "访客概览、个人资料和偏好区域将在后续接入静态布局。" },
} as const;

const groups: { label: string; items: WorkspaceView[] }[] = [
  { label: "工作空间", items: ["explore", "history"] },
  { label: "个人空间", items: ["personal"] },
];



export default function WorkspaceShell({ active, onNavigate, children, preview = false }: { active: WorkspaceView; onNavigate: (view: WorkspaceView) => void; children: ReactNode; preview?: boolean }) {
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [compact, setCompact] = useState(false);
  const collapsed = compact || userCollapsed;
  const current = views[active];

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return <div className={styles.preview} data-collapsed={collapsed} data-live={!preview}>
    <a className={styles.skipLink} href="#preview-main">跳到主要内容</a>
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}><Icon name="pin" /></span>
        <strong>地点周边</strong>
        {preview && <span className={styles.previewTag}>导航预览</span>}
      </div>
      {!compact && <button className={styles.collapseControl} type="button" aria-controls="preview-navigation" aria-expanded={!collapsed} onClick={() => setUserCollapsed((value) => !value)}>
        <span className={collapsed ? styles.flipped : undefined}><Icon name="panel" /></span>
        <span>{collapsed ? "展开导航" : "折叠导航"}</span>
      </button>}
    </header>

    <div className={styles.workspace}>
      <aside id="preview-navigation" className={styles.sidebar} aria-label="侧边导航">
        <div className={styles.workspaceName} aria-hidden="true"><Icon name="pin" /><strong>地点工作空间</strong></div>
        <nav className={styles.navigation} aria-label="主导航">
          {groups.map((group) => <div className={styles.group} key={group.label}>
            <p className={styles.groupLabel}>{group.label}</p>
            <div className={styles.groupItems}>
              {group.items.map((view) => <button className={styles.navItem} key={view} type="button" aria-label={views[view].label} data-history-entry={view === "history" ? "" : undefined} aria-pressed={active === view} onClick={() => onNavigate(view)}>
                <Icon name={views[view].icon} />
                <span className={styles.navLabel} aria-hidden="true">{views[view].label}</span>
                {collapsed && <span className={styles.tooltip} aria-hidden="true">{views[view].label}</span>}
              </button>)}
            </div>
          </div>)}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.sidebarFooter}><span className={styles.sourceDot} aria-hidden="true" /><span>高德地点数据</span></div>
          <button className={`${styles.navItem} ${styles.settingsButton}`} type="button" aria-label="设置" aria-disabled="true">
            <Icon name="settings" />
            <span className={styles.navLabel} aria-hidden="true">设置</span>
            {collapsed && <span className={styles.tooltip} aria-hidden="true">设置</span>}
          </button>
        </div>
      </aside>

      <main id="preview-main" className={styles.main} tabIndex={-1}>
        <div className={styles.contextbar}>
          <p><span>{current.group}</span><span aria-hidden="true">/</span><strong>{current.label}</strong></p>
          <button className={styles.profileButton} type="button" aria-label="打开个人中心" onClick={() => onNavigate("personal")}><Icon name="person" /></button>
        </div>
        <div className={styles.mainContent}>{children}</div>
      </main>
    </div>
  </div>;
}
