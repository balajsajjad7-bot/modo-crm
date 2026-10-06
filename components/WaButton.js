"use client";
// "WhatsApp" button: opens your normal WhatsApp (app or WhatsApp Web) with the chat and text filled in.
// No API, no setup. US numbers get +1 automatically; Pakistani 03xx numbers get +92.
export const waNumber = (phone) => {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;                       // US (10 digits)
  else if (d.length === 11 && d.startsWith("03")) d = "92" + d.slice(1); // Pakistan mobile 03xx…
  else if (d.startsWith("00")) d = d.slice(2);
  return d;
};
export const waLink = (phone, text = "") => {
  const n = waNumber(phone);
  return `https://wa.me/${n}${text ? "?text=" + encodeURIComponent(text) : ""}`;
};
const Icon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.6-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" /></svg>
);
export default function WaButton({ phone, text, label = "WhatsApp", iconOnly, title }) {
  const href = phone ? waLink(phone, text) : `https://wa.me/?text=${encodeURIComponent(text || "")}`;
  if (phone && waNumber(phone).length < 8) return null;
  return (
    <a className={"wa-btn" + (iconOnly ? " icon" : "")} href={href} target="_blank" rel="noreferrer" title={title || (phone ? "Message on WhatsApp" : "Share on WhatsApp")} aria-label={title || "WhatsApp"} onClick={(e) => e.stopPropagation()}>
      <Icon />{!iconOnly && <span>{label}</span>}
    </a>
  );
}
