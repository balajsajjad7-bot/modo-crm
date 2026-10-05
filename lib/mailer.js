import nodemailer from "nodemailer";
import { configFor } from "./connectors";

function transport(cfg) {
  if (!cfg?.host || !cfg?.user || !cfg?.pass) throw new Error("Email isn't set up yet. Add it in Admin → Tools → Connectors → Email (SMTP).");
  const port = Number(cfg.port) || 465;
  return nodemailer.createTransport({ host: cfg.host, port, secure: cfg.secure != null ? String(cfg.secure) === "true" : port === 465, auth: { user: cfg.user, pass: cfg.pass }, connectionTimeout: 10000, greetingTimeout: 10000 });
}
export async function verifySmtp(cfg) { await transport(cfg).verify(); }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Clean, email-client-safe HTML version of a plain-text message.
function html(body, fromName) {
  const paras = esc(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p.replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f6f3f1;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1d1a19">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td style="height:5px;background:linear-gradient(90deg,#22d3ee,#8b5cf6,#4c1d95)"></td></tr>
<tr><td style="padding:28px 30px 8px;font-size:15px">${paras}</td></tr>
<tr><td style="padding:0 30px 26px;font-size:12px;color:#8a7f7a">${esc(fromName || "")}</td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendMail({ to, subject, body, fromName, replyTo }) {
  const cfg = await configFor("smtp");
  const t = transport(cfg);
  const fromEmail = cfg.fromEmail || cfg.user;
  const name = fromName || cfg.fromName;
  const info = await t.sendMail({ from: name ? `"${name.replace(/"/g, "")}" <${fromEmail}>` : fromEmail, to, subject, text: body, html: html(body, name), ...(replyTo ? { replyTo } : {}) });
  return info.messageId;
}
