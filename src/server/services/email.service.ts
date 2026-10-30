import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/config/env";
import { site } from "@/config/site";
import { logger } from "@/lib/logger";

let transport: Transporter | null | undefined;

function getTransport() {
  if (transport !== undefined) return transport;
  const url = env().SMTP_URL;
  transport = url ? nodemailer.createTransport(url) : null;
  return transport;
}

export interface EmailMessage {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; href: string };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderEmail(msg: EmailMessage) {
  const body = msg.paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escape(p)}</p>`).join("");
  const cta = msg.cta
    ? `<p style="margin:32px 0"><a href="${escape(msg.cta.href)}" style="background:#161513;color:#f7f5f1;padding:14px 28px;text-decoration:none;font-size:12px;letter-spacing:.18em;text-transform:uppercase">${escape(msg.cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f5f1;font-family:Helvetica,Arial,sans-serif;color:#161513">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:48px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;padding:48px">
<tr><td style="font-size:12px;letter-spacing:.3em;text-transform:uppercase;padding-bottom:32px">${site.name}</td></tr>
<tr><td><h1 style="font-weight:500;font-size:28px;letter-spacing:-.02em;margin:0 0 24px">${escape(msg.heading)}</h1>${body}${cta}</td></tr>
<tr><td style="font-size:12px;color:#8a8277;padding-top:32px;border-top:1px solid #e2dcd2">${site.name} · ${site.supportEmail}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [msg.heading, "", ...msg.paragraphs, ...(msg.cta ? ["", `${msg.cta.label}: ${msg.cta.href}`] : [])].join("\n");
  return { html, text };
}

export async function sendEmail(msg: EmailMessage) {
  const { html, text } = renderEmail(msg);
  const t = getTransport();
  if (!t) {
    if (env().NODE_ENV === "production") {
      // Never write message bodies (they contain one-time tokens) to production logs.
      logger.error({ subject: msg.subject }, "email not sent — SMTP_URL is not configured");
      throw new Error("SMTP_URL is not configured");
    }
    // Development: log the message (links included) instead of sending.
    logger.info({ to: msg.to, subject: msg.subject, text }, "email (not sent — SMTP_URL unset)");
    return;
  }
  await t.sendMail({ from: env().EMAIL_FROM, to: msg.to, subject: msg.subject, html, text });
}

export const appUrl = (path: string) => new URL(path, env().APP_URL).toString();
