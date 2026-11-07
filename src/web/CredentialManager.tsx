"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "./identity-api";
import s from "./credential-manager.module.css";

export type Credential = { configured: boolean; status: string; lastFour?: string };
export type CredentialAction = "edit" | "remove";

function SettingsDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous instanceof HTMLElement && previous.isConnected && !document.querySelector("dialog[open]")) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={s.dialog} aria-labelledby={titleId} aria-busy={busy} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]')).filter(element => element.getClientRects().length > 0);
    const first = targets[0], last = targets.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget || busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <header className={s.dialogHeader}><h2 id={titleId}>{title}</h2><button className={s.close} type="button" aria-label="关闭弹窗" disabled={busy} onClick={onClose}>×</button></header>
    {children}
  </dialog>;
}

export function ReauthDialog({ email, password, onPassword, busy, retrySeconds, error, onCancel, onVerify }: {
  email: string; password: string; onPassword: (value: string) => void; busy: boolean; retrySeconds: number; error: string; onCancel: () => void; onVerify: () => void;
}) {
  return <SettingsDialog title="验证身份" busy={busy} onClose={onCancel}>
    <p className={s.help}>修改 Key 前，请输入当前账户的密码。</p>
    <form onSubmit={event => { event.preventDefault(); if (!busy && !retrySeconds) onVerify(); }}>
      <label className={s.field}>邮箱<input type="email" value={email} readOnly autoComplete="username" /></label>
      <label className={s.field}>当前密码<input type="password" autoFocus autoComplete="current-password" value={password} onChange={event => onPassword(event.target.value)} required minLength={8} maxLength={128} disabled={busy} /></label>
      {error && <p className={s.error} role="alert">{error}</p>}
      {retrySeconds > 0 && <p role="status">请在 {retrySeconds} 秒后重试登录</p>}
      <footer className={s.footer}><button className={s.secondary} type="button" disabled={busy} onClick={onCancel}>取消</button><button className={s.primary} disabled={busy || retrySeconds > 0}>{busy ? "验证中…" : retrySeconds > 0 ? `${retrySeconds} 秒后重试` : "验证并继续"}</button></footer>
    </form>
  </SettingsDialog>;
}

export function CredentialManager({ credential, sessionId, requiresReauth, initialAction, onActionConsumed, onChanged, onReauth, onIdentityInvalid }: {
  credential: Credential; sessionId: string; requiresReauth: boolean; initialAction: CredentialAction | null; onActionConsumed: () => void; onChanged: (credential: Credential) => Promise<void>; onReauth: (action: CredentialAction) => void; onIdentityInvalid: () => void;
}) {
  const [action, setAction] = useState<CredentialAction | null>(initialAction);
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { if (initialAction) onActionConsumed(); }, [initialAction, onActionConsumed]);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  function close() { setAction(null); setKey(""); setVisible(false); setError(""); }
  function open(next: CredentialAction) { setMessage(""); if (requiresReauth) onReauth(next); else setAction(next); }
  async function save() {
    if (!action || busy) return;
    const current = generation.current;
    setBusy(true); setError("");
    try {
      const next: Credential = await api("/api/account/amap-credential", action === "edit" ? "PUT" : "DELETE", action === "edit" ? { key: key.trim() } : undefined, sessionId);
      if (current !== generation.current) return;
      setKey(""); setVisible(false);
      await onChanged(next);
      if (current !== generation.current) return;
      setMessage(action === "edit" ? "Key 已保存，下次搜索时验证。" : "Key 已移除，搜索历史已保留。"); close();
    } catch (cause) {
      if (current !== generation.current) return;
      if (cause instanceof ApiError && cause.code === "REAUTH_REQUIRED") { close(); onReauth(action); }
      else if (cause instanceof ApiError && ["SESSION_EXPIRED", "IDENTITY_REQUIRED", "ACCOUNT_REQUIRED", "SESSION_CHANGED"].includes(cause.code ?? "")) { close(); onIdentityInvalid(); }
      else setError(cause instanceof Error ? cause.message : "操作未完成，请重试");
    } finally { if (current === generation.current) setBusy(false); }
  }
  const status = !credential.configured ? "未配置" : credential.status === "valid" ? "已验证" : credential.status === "invalid" ? "需要更新" : "待验证";
  return <section className={s.panel} aria-label="高德 Key 管理">
    <div className={s.content}><h1>个人中心</h1><p className={s.subtitle}>管理你的地图服务</p>
      <section className={s.card} aria-labelledby="amap-service-title">
        <header className={s.serviceHeader}><span className={s.serviceIcon} aria-hidden="true">⌖</span><div><h2 id="amap-service-title">高德服务</h2><p className={s.help}>用于地点解析和附近搜索</p></div></header>
        <div className={s.keyRow}><span>API Key</span><span className={s.status} data-status={credential.status}>{status}</span></div>
        <p className={s.masked}>{credential.configured ? `•••• •••• •••• ${credential.lastFour ?? ""}` : "添加 Key，开始探索附近"}</p>
        <p className={s.help}>{!credential.configured ? "使用高德开放平台的 Web 服务 Key。" : credential.status === "valid" ? "搜索将使用此 Key。" : credential.status === "invalid" ? "此 Key 暂时无法使用，请更换后重试。" : "已保存，下次搜索时验证。"}</p>
        <div className={s.actions}><button className={s.primary} onClick={() => open("edit")}>{credential.configured ? "更换 Key" : "添加 Key"}</button><a className={s.secondary} href="https://console.amap.com/dev/key/app" target="_blank" rel="noreferrer">申请高德 Key <span aria-hidden="true">↗</span></a></div>
        {credential.configured && <div className={s.dangerRow}><div><strong>移除 Key</strong><p className={s.help}>移除后暂停搜索，历史记录保留。</p></div><button className={s.dangerQuiet} onClick={() => open("remove")}>移除 Key</button></div>}
      </section>
      {message && <p className={s.message} role="status">{message}</p>}
    </div>
    {action && <SettingsDialog title={action === "remove" ? "移除高德 Key？" : credential.configured ? "更换高德 Key" : "添加高德 Key"} busy={busy} onClose={close}>
      {action === "remove" ? <p className={s.help}>移除后将暂停地点解析和搜索。账户和搜索历史会继续保留，你可以随时添加新的 Key。</p> : <p className={s.help}>填写高德开放平台的 Web 服务 Key。</p>}
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        {action === "edit" && <><label className={s.field}>新的高德 Key<span className={s.inputWrap}><input aria-label="新的高德 Key" autoFocus type={visible ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder="粘贴 32 位 Key" value={key} onChange={event => setKey(event.target.value)} required pattern="[a-fA-F0-9]{32}" maxLength={32} disabled={busy} /><button className={s.reveal} type="button" aria-label={visible ? "隐藏 Key" : "显示 Key"} aria-pressed={visible} onClick={() => setVisible(value => !value)} disabled={busy}>{visible ? "隐藏" : "显示"}</button></span></label><p className={s.help}>Key 加密保存，保存后仅显示末四位。下次搜索时验证。</p></>}
        {error && <p className={s.error} role="alert">{error}</p>}
        <footer className={s.footer}><button className={s.secondary} type="button" disabled={busy} onClick={close}>取消</button><button className={action === "remove" ? s.danger : s.primary} disabled={busy}>{busy ? "处理中…" : action === "remove" ? "确认移除" : "保存 Key"}</button></footer>
      </form>
    </SettingsDialog>}
  </section>;
}
