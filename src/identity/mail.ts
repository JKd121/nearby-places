import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import nodemailer from "nodemailer";
import { IdentityError } from "./security.js";


async function deliverMail(to: string, url: string, purpose: "verify" | "reset") {
  const host = process.env.SMTP_HOST, from = process.env.SMTP_FROM;
  if (!host || !from) throw new IdentityError("MAIL_UNAVAILABLE", 503, "邮件服务暂不可用，请稍后重试");
  const transport = nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_SECURE === "true", requireTLS: process.env.NODE_ENV === "production", connectionTimeout: 5000, socketTimeout: 5000,
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } } : {}) });
  try { await transport.sendMail({ from, to, subject: purpose === "verify" ? "验证 Nearby 邮箱" : "重置 Nearby 密码",
    text: `${purpose === "verify" ? "验证邮箱" : "重置密码"}：\n${url}\n如果链接已过期，请返回 Nearby 重新申请。` }); }
  catch { throw new IdentityError("MAIL_UNAVAILABLE", 503, "邮件发送失败，请稍后重试"); }
  finally { transport.close(); }
}

const delivery = new AsyncLocalStorage<{ error?: IdentityError }>();
export async function withMailDelivery<T>(action: () => Promise<T>): Promise<T> {
  return delivery.run({}, async () => {
    const result = await action();
    const error = delivery.getStore()?.error;
    if (error) throw error;
    return result;
  });
}
export async function sendIdentityMail(to: string, url: string, purpose: "verify" | "reset") {
  try { await deliverMail(to, url, purpose); }
  catch (error) {
    const safe = error instanceof IdentityError ? error : new IdentityError("MAIL_UNAVAILABLE", 503, "邮件服务暂不可用，请稍后重试");
    const state = delivery.getStore(); if (state) state.error = safe;
    throw safe;
  }
}
