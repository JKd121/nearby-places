"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SearchApp from "./SearchApp";
import { GUEST_HISTORY_KEY } from "./local-history";
import s from "./identity.module.css";

import { CredentialManager, ReauthDialog, type Credential, type CredentialAction } from "./CredentialManager";
import { api, LoginRateError } from "./identity-api";
import type { WorkspaceView } from "./ui/WorkspaceShell";
type Identity = ({ kind: "none" } | { kind: "guest"; id: string } | { kind: "account"; id: string; sessionId: string; email: string; credential: Credential; credentialRequiresReauth: boolean }) & { accessMode?: "verified" | "local-beta" | "private-beta" };
type Mode = "choose" | "login" | "register" | "forgot" | "reset";
const EVENT_KEY = "nearby.identity.change";
function identityKey(identity: Identity) {
  return identity.kind === "none" ? "none" : identity.kind === "guest" ? `guest:${identity.id}` : `account:${identity.id}:${identity.sessionId}`;
}

function clearGuestHistory() { try { localStorage.removeItem(GUEST_HISTORY_KEY); } catch { /* Storage may be disabled. */ } }
function notifyIdentity() { try { localStorage.setItem(EVENT_KEY, crypto.randomUUID()); } catch { /* Focus also revalidates. */ } }

export default function IdentityApp() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [mode, setMode] = useState<Mode>("choose");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("explore");
  const [reauthTarget, setReauthTarget] = useState<CredentialAction | null>(null);
  const [credentialInitialAction, setCredentialInitialAction] = useState<CredentialAction | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginRetryAt, setLoginRetryAt] = useState(0);
  const [loginClock, setLoginClock] = useState(() => Date.now());
  const retrySeconds = Math.max(0, Math.ceil((loginRetryAt - loginClock) / 1000));
  const [reauth, setReauth] = useState(false);
  const [usage, setUsage] = useState<{ remaining: number; limit: number; resetsAt: string } | null>(null);
  const version = useRef(0);
  const currentIdentity = useRef<Identity | null>(null);
  const resumeCredential = useRef<{ userId: string; action: CredentialAction } | null>(null);
  const actionVersion = useRef(0);
  const applyIdentity = useCallback((next: Identity) => {
    const previous = currentIdentity.current;
    if (previous && identityKey(previous) !== identityKey(next)) {
      actionVersion.current++;
      setEmail(""); setPassword(""); setError(""); setBusy(false); setUsage(null);
      setLoginRetryAt(0);
      setReauthTarget(null);
      setReauth(false);
      setMode(next.kind === "none" && previous.kind === "account" ? "login" : "choose");
      setMessage(next.kind === "none" && previous.kind === "account" ? "登录会话已结束，请重新登录。" : "");
    }
    if (next.kind === "account" && (!previous || identityKey(previous) !== identityKey(next))) {
      clearGuestHistory();
      const resume = resumeCredential.current;
      const action = resume?.userId === next.id && !next.credentialRequiresReauth ? resume.action : null;
      setCredentialInitialAction(action);
      setWorkspaceView(action || !next.credential.configured || next.credential.status === "invalid" ? "personal" : "explore");
    }
    if (!previous || identityKey(previous) !== identityKey(next)) resumeCredential.current = null;
    currentIdentity.current = next;
    if (next.accessMode && next.accessMode !== "verified") setMode("login");
    setIdentity(next);
  }, []);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    try {
      const next: Identity = await api("/api/identity");
      if (current !== version.current) return;
      applyIdentity(next); setRefreshError("");
      if (next.kind === "guest") {
        const nextUsage = await api("/api/guest/usage", "GET", undefined, next.id);
        if (current === version.current && currentIdentity.current && identityKey(currentIdentity.current) === identityKey(next)) setUsage(nextUsage);
      }
    } catch (e) { if (current === version.current) setRefreshError(e instanceof Error ? e.message : "身份读取失败，请重试"); }
  }, [applyIdentity]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("token")) { setMode("reset"); setReauth(true); }
    else if (params.has("verified")) { setMode("login"); setReauth(true); setMessage("邮箱验证已完成，请登录"); }
    else if (params.has("error")) {
      setMode(params.has("reset") ? "forgot" : "login"); setReauth(true);
      setError(params.has("reset") ? "重置链接已过期或已使用，请重新申请。" : "验证链接已过期或已使用，请重新发送");
    }
    void refresh();
    const changed = () => { void refresh(); };
    const storage = (event: StorageEvent) => {
      if (event.key === EVENT_KEY) {
        // Authentication changed in another tab: hide private state until server revalidation.
        setIdentity(null); setPassword(""); setReauthTarget(null); resumeCredential.current = null; actionVersion.current++; changed();
      }
    };
    window.addEventListener("focus", changed); window.addEventListener("storage", storage);
    const timer = setInterval(() => { void refresh(); }, 30000);
    const invalidate = () => { version.current++; };
    return () => { invalidate(); clearInterval(timer); window.removeEventListener("focus", changed); window.removeEventListener("storage", storage); };
  }, [refresh]);
  useEffect(() => {
    if (!loginRetryAt) return;
    const timer = setInterval(() => { const now = Date.now(); setLoginClock(now); if (now >= loginRetryAt) setLoginRetryAt(0); }, 250);
    return () => clearInterval(timer);
  }, [loginRetryAt]);
  async function run(action: () => Promise<void>) {
    const current = ++actionVersion.current;
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { if (current === actionVersion.current) {
      setError(e instanceof Error ? e.message : "操作未完成");
      if (e instanceof LoginRateError) { const now = Date.now(); setLoginClock(now); setLoginRetryAt(now + e.retryAfter * 1000); }
    } }
    finally { if (current === actionVersion.current) setBusy(false); }
  }
  async function guest() { await api("/api/guest/session", "POST"); notifyIdentity(); await refresh(); }
  async function logout() {
    if (identity?.kind === "account") await api("/api/auth/sign-out", "POST", {});
    else { await api("/api/guest/session", "DELETE"); clearGuestHistory(); }
    version.current++;
    applyIdentity({ kind: "none", ...(identity?.accessMode ? { accessMode: identity.accessMode } : {}) });
    notifyIdentity(); await refresh();
    if (currentIdentity.current?.kind === "none") { setMode("choose"); setReauthTarget(null); setReauth(false); }
  }
  async function submit() {
    if ((mode === "login" || mode === "choose") && retrySeconds > 0) return;
    const current = actionVersion.current;
    if (mode === "register") {
      await api("/api/auth/sign-up/email", "POST", { name: email.split("@")[0] || "Nearby 用户", email, password, callbackURL: "/?verified=1" });
      if (current !== actionVersion.current) return;
      setMessage("注册请求已处理，请检查验证邮件；完成验证后登录。"); setMode("login");
    } else if (mode === "forgot") {
      await api("/api/auth/request-password-reset", "POST", { email, redirectTo: "/?reset=1" }); if (current !== actionVersion.current) return; setMessage("若邮箱已注册，你将收到密码重置邮件。");
    } else if (mode === "reset") {
      const token = new URLSearchParams(window.location.search).get("token");
      await api("/api/auth/reset-password", "POST", { token, newPassword: password });
      if (current !== actionVersion.current) return;
      history.replaceState(null, "", "/");
      await refresh(); setMode("login"); setReauth(true); setMessage("密码已重置，请重新登录。");
    } else {
      await api("/api/auth/sign-in/email", "POST", { email, password });
      version.current++; setIdentity(null); setEmail(""); setPassword("");
      clearGuestHistory(); notifyIdentity();
      if (current !== actionVersion.current) { await refresh(); return; }
      history.replaceState(null, "", "/"); await refresh();
    }
    setPassword("");
  }
  const refreshFeedback = refreshError && <div role="alert"><p>{refreshError}</p><button type="button" onClick={() => void refresh()}>重新读取身份</button></div>;
  const retryFeedback = retrySeconds > 0 && <p role="status">请在 {retrySeconds} 秒后重试登录</p>;
  if (!identity) return <main className={s.card}>{refreshFeedback || <p role="status">正在读取身份…</p>}</main>;
  if ((identity.kind === "none" || reauth) && identity.accessMode && identity.accessMode !== "verified") return <BetaLogin
    local={identity.accessMode === "local-beta"} email={email} password={password} busy={busy} retrySeconds={retrySeconds}
    onEmail={setEmail} onPassword={setPassword} onSubmit={() => void run(submit)} onGuest={() => void run(guest)}
    onBack={reauth ? () => { setReauth(false); setPassword(""); resumeCredential.current = null; } : undefined}
    feedback={<>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}{retryFeedback}{refreshFeedback}</>} />;
  if (identity.kind === "none" || reauth) return <main className={s.card}>
    <h1>欢迎使用 Nearby</h1><p>匿名体验，或登录后使用自己的高德 Key。</p>
    {mode === "choose" ? <div className={s.actions}><button disabled={busy} onClick={() => void run(guest)}>匿名体验</button><button onClick={() => setMode("login")}>注册 / 登录</button></div> : <>
      <div className={s.actions}><button onClick={() => setMode("login")} aria-pressed={mode === "login"}>登录</button><button onClick={() => setMode("register")} aria-pressed={mode === "register"}>注册</button></div>
      <h2>{({ login: "登录账户", register: "注册账户", forgot: "找回密码", reset: "设置新密码", choose: "选择身份" })[mode]}</h2>
      <form onSubmit={e => { e.preventDefault(); void run(submit); }}>
        {mode !== "reset" && <label>邮箱<input aria-label="邮箱" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></label>}
        {mode !== "forgot" && <label>密码<input aria-label="密码" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}
        <button disabled={busy || (mode === "login" && retrySeconds > 0)} type="submit">{busy ? "处理中…" : mode === "login" && retrySeconds > 0 ? `${retrySeconds} 秒后重试` : ({ login: "登录", register: "注册并发送验证邮件", forgot: "发送重置邮件", reset: "保存新密码", choose: "继续" })[mode]}</button>
      </form>
      <div className={s.actions}><button disabled={busy} onClick={() => setMode("forgot")}>忘记密码</button><button disabled={busy || !email} onClick={() => void run(async () => { await api("/api/auth/send-verification-email", "POST", { email, callbackURL: "/?verified=1" }); setMessage("验证邮件已发送，请检查邮箱。"); })}>重新发送验证邮件</button><button onClick={() => { setMode("choose"); setReauth(false); setEmail(""); setPassword(""); resumeCredential.current = null; }}>返回</button></div>
    </>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}{retryFeedback}{refreshFeedback}
  </main>;
  const credentialPanel = identity.kind === "account" ? <CredentialManager key={identity.sessionId} sessionId={identity.sessionId} credential={identity.credential} requiresReauth={identity.credentialRequiresReauth} initialAction={credentialInitialAction} onActionConsumed={() => setCredentialInitialAction(null)}
    onChanged={async credential => {
      const current = currentIdentity.current;
      if (current?.kind !== "account" || current.sessionId !== identity.sessionId) return;
      currentIdentity.current = { ...current, credential };
      setIdentity(visible => visible?.kind === "account" && visible.sessionId === identity.sessionId ? { ...visible, credential } : visible);
      await refresh();
    }} onIdentityInvalid={() => { version.current++; setIdentity(null); setPassword(""); setReauthTarget(null); resumeCredential.current = null; void refresh(); }} onReauth={action => { setPassword(""); setError(""); setReauthTarget(action); }} /> : <p>匿名历史保存在当前浏览器，退出体验时清除。</p>;
  return <>
    <div className={s.toolbar}><span>{identity.kind === "guest" ? `匿名体验${usage ? ` · 今日剩余 ${usage.remaining} / ${usage.limit} 次` : ""}` : identity.email}</span>
      {identity.kind === "guest" && usage && <small>北京时间 {new Date(usage.resetsAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} 重置；解析、分类及翻页按调用计数</small>}
      {identity.kind === "account" && <button onClick={() => setWorkspaceView("personal")}>高德 Key 设置</button>}
      {identity.kind === "guest" && <button onClick={() => { setReauth(true); setMode("login"); }}>{identity.accessMode === "local-beta" ? "登录账户" : "注册 / 登录"}</button>}
      <button disabled={busy} onClick={() => void run(logout)}>{identity.kind === "guest" ? "退出体验" : "退出登录"}</button>
    </div>
    {identity.kind === "account" && reauthTarget && <ReauthDialog email={identity.email} password={password} onPassword={setPassword} busy={busy} retrySeconds={retrySeconds} error={error} onCancel={() => { setReauthTarget(null); setPassword(""); setError(""); }} onVerify={() => void run(async () => {
      await api("/api/auth/sign-in/email", "POST", { email: identity.email, password });
      resumeCredential.current = { userId: identity.id, action: reauthTarget };
      version.current++; setIdentity(null); setPassword(""); clearGuestHistory(); notifyIdentity(); await refresh();
    })} />}
    {error && !reauthTarget && <p className={s.notice} role="alert">{error}</p>}
    {refreshFeedback && <div className={s.notice}>{refreshFeedback}</div>}
    <SearchApp key={identity.kind + identity.id + (identity.kind === "account" ? identity.sessionId : "")} identityKind={identity.kind} sessionId={identity.kind === "guest" ? identity.id : identity.sessionId} personal={credentialPanel} activeView={workspaceView} onViewChange={setWorkspaceView} credentialIssue={identity.kind === "account" && (!identity.credential.configured || identity.credential.status === "invalid")} onRequestSettled={() => { void refresh(); }} />
  </>;
}

function BetaLogin({ local, email, password, busy, retrySeconds, onEmail, onPassword, onSubmit, onGuest, onBack, feedback }: {
  local: boolean; email: string; password: string; busy: boolean; retrySeconds: number;
  onEmail: (value: string) => void; onPassword: (value: string) => void; onSubmit: () => void; onGuest: () => void;
  onBack: (() => void) | undefined; feedback: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return <main className={s.loginScreen}>
    <header className={s.loginHeader}><span className={s.brand}><svg width="28" height="32" viewBox="0 0 28 32" fill="none" aria-hidden="true"><path d="M25 12C25 21 14 30 14 30S3 21 3 12a11 11 0 1 1 22 0Z" fill="currentColor" /><circle cx="14" cy="12" r="4" fill="var(--login-paper)" /></svg>Nearby</span>{local && <span className={s.betaLabel}>本机测试版</span>}</header>
    <div className={s.loginBody}>
      <div className={s.loginLayout}>
        <div className={s.loginHeading}><h1>登录 Nearby</h1><p>使用邮箱和密码，继续探索附近</p></div>
        <section className={s.loginCard} aria-label="账户登录">
          <form onSubmit={event => { event.preventDefault(); onSubmit(); }}>
            <label>邮箱<input aria-label="邮箱" type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={event => onEmail(event.target.value)} required maxLength={254} /></label>
            <label>密码<span className={s.passwordField}><input aria-label="密码" type={visible ? "text" : "password"} autoComplete="current-password" placeholder="请输入密码" value={password} onChange={event => onPassword(event.target.value)} required minLength={8} maxLength={128} /><button type="button" aria-label={visible ? "隐藏密码" : "显示密码"} aria-pressed={visible} onClick={() => setVisible(value => !value)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg></button></span></label>
            <button className={s.primaryLogin} disabled={busy || retrySeconds > 0}>{busy ? "登录中…" : retrySeconds > 0 ? `${retrySeconds} 秒后重试` : "登录"}</button>
          </form>
          <div className={s.loginFeedback}>{feedback}</div>
        </section>
        {local && <div className={s.guestEntry}><button type="button" disabled={busy} onClick={onGuest}>匿名体验</button><p>每日 60 次体验额度</p></div>}
        {onBack && <button className={s.backLogin} type="button" onClick={onBack}>返回</button>}
        <p className={s.loginHelper}>账号由维护者提供</p>
      </div>
    </div>
  </main>;
}
