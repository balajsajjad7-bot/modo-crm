// Email intel: format, typo fix, mail servers (MX), anti-spoofing records (SPF/DMARC), throwaway and
// role-address detection, domain age (RDAP), Gravatar profile, and mailbox deliverability when a free
// Abstract Email key is connected.
import crypto from "node:crypto";
import { getJSON, source, DAY } from "./http";

const DISPOSABLE = new Set("mailinator.com guerrillamail.com 10minutemail.com tempmail.com temp-mail.org trashmail.com yopmail.com sharklasers.com getnada.com dispostable.com maildrop.cc mintemail.com throwawaymail.com fakeinbox.com emailondeck.com mohmal.com tempail.com burnermail.io spamgourmet.com mailnesia.com mytemp.email tempr.email discard.email moakt.com tmpmail.org inboxkitten.com mailpoof.com emailfake.com 33mail.com anonaddy.me grr.la guerrillamailblock.com pokemail.net spam4.me".split(" "));
const FREE = new Set("gmail.com googlemail.com yahoo.com ymail.com hotmail.com outlook.com live.com msn.com aol.com icloud.com me.com mac.com protonmail.com proton.me gmx.com gmx.us zoho.com mail.com yandex.com att.net sbcglobal.net bellsouth.net verizon.net comcast.net cox.net charter.net spectrum.net earthlink.net frontier.com optonline.net windstream.net centurylink.net".split(" "));
const ISP = new Set("att.net sbcglobal.net bellsouth.net verizon.net comcast.net cox.net charter.net spectrum.net earthlink.net frontier.com optonline.net windstream.net centurylink.net".split(" "));
const TYPOS = { "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com", "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.co": "yahoo.com", "yahoo.con": "yahoo.com", "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.com", "outlok.com": "outlook.com", "outlook.co": "outlook.com", "iclod.com": "icloud.com", "icloud.co": "icloud.com", "aol.co": "aol.com", "comcast.com": "comcast.net", "att.com": "att.net" };
const ROLE = /^(info|admin|support|sales|contact|office|hello|billing|help|noreply|no-reply|team|webmaster|accounts?)$/;

const dns = (name, type) => getJSON(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { ttl: 7 * DAY }).then((r) => r.json?.Answer || []);
async function domainAge(domain) {
  const r = await getJSON(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { ttl: 30 * DAY, headers: { accept: "application/rdap+json" } });
  const ev = r.json?.events || [];
  const reg = ev.find((e) => e.eventAction === "registration")?.eventDate;
  return reg ? new Date(reg) : null;
}
async function gravatar(e) {
  const h = crypto.createHash("sha256").update(e).digest("hex");
  const r = await fetch(`https://gravatar.com/avatar/${h}?d=404&s=80`, { method: "HEAD", signal: AbortSignal.timeout(6000) });
  return r.ok ? `https://gravatar.com/avatar/${h}?s=160` : false;
}
async function abstract(cfg, e) {
  const r = await getJSON(`https://emailvalidation.abstractapi.com/v1/?api_key=${encodeURIComponent(cfg.apiKey)}&email=${encodeURIComponent(e)}`, { ttl: 7 * DAY });
  const j = r.json; if (!r.ok || !j || j.error) throw new Error(j?.error?.message || `Abstract ${r.status}`);
  return { deliverability: j.deliverability, smtp: j.is_smtp_valid?.value, score: j.quality_score, catchAll: j.is_catchall_email?.value };
}

export async function emailIntel(input, cfgs) {
  const e = String(input || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return { error: "That doesn't look like an email address." };
  const [user, domain] = e.split("@");
  const typo = TYPOS[domain];
  const [sMx, sTxt, sDm, sAge, sGr, sAb] = await Promise.all([
    source("MX records (Google DNS)", () => dns(domain, "MX")),
    source("SPF (Google DNS)", () => dns(domain, "TXT")),
    source("DMARC (Google DNS)", () => dns("_dmarc." + domain, "TXT")),
    FREE.has(domain) ? Promise.resolve(null) : source("Domain age (RDAP)", () => domainAge(domain)),
    source("Gravatar", () => gravatar(e)),
    cfgs.abstractemail?.apiKey ? source("Abstract email validation", () => abstract(cfgs.abstractemail, e)) : Promise.resolve(null),
  ]);
  const mx = (sMx.data || []).filter((a) => a.type === 15).map((a) => a.data.split(" ").pop().replace(/\.$/, ""));
  const spf = (sTxt.data || []).some((a) => /v=spf1/i.test(a.data));
  const dmarc = (sDm.data || []).some((a) => /v=DMARC1/i.test(a.data));
  const disposable = DISPOSABLE.has(domain) || /tempmail|throwaway|trashmail|10minute|guerrilla|yopmail|mailinator/.test(domain);
  const type = disposable ? "Throwaway address" : ISP.has(domain) ? "Internet-provider email" : FREE.has(domain) ? "Personal (free provider)" : "Business / own domain";
  const facts = [["Email", e], ["Type", type, disposable ? "bad" : null]];
  const badges = [];
  if (typo) { facts.push(["Did they mean?", `${user}@${typo}`, "warn"]); badges.push({ text: `Typo? → ${typo}`, tone: "warn" }); }
  const dnsOk = sMx.ok;
  facts.push(["Domain accepts email", !dnsOk ? "Couldn't check right now — try again" : mx.length ? `Yes · ${mx.slice(0, 2).join(", ")}` : "No mail server — this address can't receive email", !dnsOk ? "muted" : mx.length ? "ok" : "bad"]);
  facts.push(["Anti-spoofing (SPF / DMARC)", `${spf ? "SPF ✓" : "no SPF"} · ${dmarc ? "DMARC ✓" : "no DMARC"}`]);
  if (ROLE.test(user)) { facts.push(["Role address", "Shared inbox (info@, sales@…) — not a person", "warn"]); badges.push({ text: "Shared inbox", tone: "warn" }); }
  const age = sAge?.data;
  if (age) { const yrs = (Date.now() - age) / 31557600000; facts.push(["Domain registered", `${age.toISOString().slice(0, 10)} (${yrs < 1 ? Math.round(yrs * 12) + " months" : yrs.toFixed(1) + " years"} ago)`, yrs < 0.5 ? "warn" : null]); if (yrs < 0.5) badges.push({ text: "Brand-new domain", tone: "warn" }); }
  if (ISP.has(domain)) badges.push({ text: "ISP email — hints at their current provider", tone: "info" });
  const ab = sAb?.data;
  if (ab) {
    facts.push(["Mailbox check", `${ab.deliverability || "unknown"}${ab.catchAll ? " · catch-all domain" : ""}${ab.score != null ? " · quality " + Math.round(ab.score * 100) + "%" : ""}`, ab.deliverability === "DELIVERABLE" ? "ok" : ab.deliverability === "UNDELIVERABLE" ? "bad" : null]);
    if (ab.deliverability === "UNDELIVERABLE") badges.push({ text: "Mailbox doesn't exist", tone: "bad" });
  } else facts.push(["Mailbox check", "Add a free Abstract Email key in Connectors → Customer intel to test the exact mailbox", "muted"]);
  if (disposable) badges.push({ text: "Throwaway email", tone: "bad" });
  else if (mx.length) badges.push({ text: "Can receive email", tone: "ok" });
  else if (dnsOk) badges.push({ text: "Can't receive email", tone: "bad" });
  if (sGr.data) facts.push(["Gravatar", "Has a public profile photo"]);
  return {
    facts, badges, avatar: sGr.data || null, deliverable: !dnsOk ? null : !!mx.length && !disposable && ab?.deliverability !== "UNDELIVERABLE", disposable, typo: typo ? `${user}@${typo}` : null,
    sources: [sMx, sTxt, sDm, sAge, sGr, sAb].filter(Boolean).map(({ name, ok, ms, note }) => ({ name, ok, ms, note })),
  };
}
