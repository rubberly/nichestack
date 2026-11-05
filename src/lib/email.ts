import { SITE } from "./site";

interface Email {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

/**
 * Sends through Resend's HTTP API (free tier: 3,000/month) using plain fetch, no SDK.
 * With no RESEND_API_KEY in development, the email is printed to the terminal instead.
 */
export async function sendEmail({ to, subject, text, html, replyTo }: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    console.log(`\n──── EMAIL (dev: printed, not sent) ────\nTo: ${to}\nSubject: ${subject}\n\n${text}\n────────────────────────────────────────\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Email send failed (${res.status})`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function buttonEmail(opts: { heading: string; body: string; button: string; url: string; footer?: string }) {
  const { heading, body, button, url, footer } = opts;
  const text = `${heading}\n\n${body}\n\n${button}: ${url}\n\n${footer ?? ""}`.trim();
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0f172a">
<h2 style="margin:0 0 12px">${esc(heading)}</h2><p style="line-height:1.5">${esc(body)}</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(button)}</a></p>
<p style="color:#64748b;font-size:13px">${esc(footer ?? "")}</p><p style="color:#94a3b8;font-size:12px">${esc(SITE.name)}</p></div>`;
  return { text, html };
}
