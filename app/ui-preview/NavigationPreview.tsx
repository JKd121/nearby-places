"use client";
import { useState } from "react";
import WorkspaceShell, { type WorkspaceView } from "../../src/web/ui/WorkspaceShell";
import { Icon } from "../../src/web/ui/icons";
import styles from "../../src/web/ui/workspace.module.css";
const labels = { explore: "搜索工作区", history: "最近搜索内容区", personal: "个人空间内容区" };
export default function NavigationPreview() {
  const [active, setActive] = useState<WorkspaceView>("explore");
  return <WorkspaceShell active={active} onNavigate={setActive} preview>
    <div className={styles.content}>
      <div className={styles.pageHeading}><h1>{labels[active]}</h1><p>导航外壳预览。完整页面请打开网站首页。</p></div>
      <section className={styles.stage}>
        <div className={styles.stageTopline}><span className={styles.stageBadge}>导航外壳预览</span></div>
        <div className={styles.stageBody}><span className={styles.stageIcon}><Icon name={active === "explore" ? "search" : active === "history" ? "clock" : "person"} /></span><h2>{labels[active]}</h2><p>可以切换导航、展开与折叠。本页不连接搜索或历史业务。</p></div>
      </section>
    </div>
  </WorkspaceShell>;
}
