// Small device picture for a sale: the shape follows the device type (iPhone, iPad, Galaxy, Pixel, watch,
// earbuds, laptop…), tinted with the device color, with the model name on the screen.

const COLORS = [
  [/midnight|black|graphite|space ?gr[ae]y|obsidian|onyx|phantom black/i, "#2b2d33"],
  [/starlight|cream/i, "#efe6d6"], [/white|porcelain|snow/i, "#f2f2f4"], [/silver|natural|titanium(?! (black|blue))/i, "#c9c9cc"],
  [/titanium black|black titanium/i, "#3a3a3d"], [/desert/i, "#c9ad8f"], [/gold|champagne/i, "#e6cfa3"],
  [/sierra|pacific|deep blue|navy|blue titanium|ultramarine/i, "#3d5a80"], [/blue|sky|teal|ice/i, "#8fb5dd"],
  [/pink|rose|coral|blush/i, "#f2c1cc"], [/purple|lavender|violet|lilac/i, "#b9a6d9"], [/green|mint|sage|alpine|hazel/i, "#a8c9a5"],
  [/red|product/i, "#c8323c"], [/yellow|lemon/i, "#f1dd84"], [/orange/i, "#f0a167"], [/gr[ae]y|charcoal|slate/i, "#8a8d93"],
];
export const tint = (c) => (COLORS.find(([re]) => re.test(c || "")) || [, "#9aa0aa"])[1];

export function kindOf(device = "") {
  const d = String(device).toLowerCase();
  if (/ipad/.test(d)) return "ipad";
  if (/watch/.test(d)) return "watch";
  if (/airpod|buds|earbud|headphone|beats/.test(d)) return "buds";
  if (/macbook|laptop|chromebook|notebook|surface laptop/.test(d)) return "laptop";
  if (/tab\b|tablet|galaxy tab|surface|fire hd|pad\b/.test(d)) return "tablet";
  if (/fold|flip/.test(d)) return /flip/.test(d) ? "flip" : "fold";
  if (/iphone/.test(d)) return "iphone";
  if (/pixel/.test(d)) return "pixel";
  if (/galaxy|samsung|android|moto|oneplus|lg|nokia|xiaomi|redmi|oppo|vivo|tcl|phone/.test(d)) return "android";
  return d ? "phone" : "none";
}

// Short label for the screen: "iPhone 15 Pro", "iPad Air", "Galaxy S24"…
function shortName(device = "") {
  return String(device).replace(/^(apple|samsung|google)\s+/i, "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\b\d+\s*(gb|tb)\b/ig, "").trim();
}
const LABEL = { iphone: "iPhone", ipad: "iPad", android: "Android", pixel: "Pixel", watch: "Watch", buds: "Earbuds", laptop: "Laptop", tablet: "Tablet", fold: "Fold", flip: "Flip", phone: "Phone", none: "Device" };

function lines(text, max) {
  const words = text.split(/\s+/).filter(Boolean); const out = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) out.push(cur);
  return out.slice(0, 3);
}

export default function DeviceArt({ device, color, size = 54, title }) {
  const k = kindOf(device); const body = tint(color); const dark = /^#[0-3]/.test(body);
  const edge = dark ? "#5a5d66" : "rgba(0,0,0,.28)"; const scr = "#0e1424";
  const name = shortName(device) || LABEL[k];
  const Txt = ({ x, y, w, max = 9, fs = 6.2 }) => {
    const ls = lines(name, max);
    return <text x={x} y={y - ((ls.length - 1) * fs * 0.6)} textAnchor="middle" fontSize={fs} fontWeight="700" fill="#e9eefc" fontFamily="system-ui,-apple-system,Segoe UI,sans-serif" style={{ letterSpacing: ".1px" }}>
      {ls.map((l, i) => <tspan key={i} x={x} dy={i ? fs * 1.15 : 0} textLength={l.length > max - 1 ? w : undefined} lengthAdjust="spacingAndGlyphs">{l}</tspan>)}
    </text>;
  };
  const glow = <linearGradient id={`dg-${k}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b4f8f" /><stop offset="1" stopColor="#101830" /></linearGradient>;
  const screenFill = `url(#dg-${k})`;
  let art;
  switch (k) {
    case "ipad": case "tablet":
      art = <svg viewBox="0 0 64 50" width={size * 1.28} height={size}>
        <defs>{glow}</defs>
        <rect x="1.5" y="1.5" width="61" height="47" rx="6" fill={body} stroke={edge} />
        <rect x="5" y="5" width="54" height="40" rx="2.5" fill={screenFill} />
        {k === "ipad" && <circle cx="32" cy="3.3" r=".9" fill={dark ? "#888" : "#555"} />}
        <Txt x={32} y={27} w={44} max={12} fs={7} />
      </svg>; break;
    case "watch":
      art = <svg viewBox="0 0 40 56" width={size * 0.72} height={size}>
        <defs>{glow}</defs>
        <rect x="11" y="1" width="18" height="12" rx="3" fill={body} opacity=".75" stroke={edge} /><rect x="11" y="43" width="18" height="12" rx="3" fill={body} opacity=".75" stroke={edge} />
        <rect x="4" y="10" width="32" height="36" rx="9" fill={body} stroke={edge} /><rect x="36" y="20" width="2.5" height="7" rx="1" fill={edge} />
        <rect x="7" y="13" width="26" height="30" rx="6.5" fill={screenFill} />
        <Txt x={20} y={30} w={22} max={7} fs={5.6} />
      </svg>; break;
    case "buds":
      art = <svg viewBox="0 0 56 50" width={size * 1.12} height={size}>
        <rect x="6" y="14" width="44" height="32" rx="14" fill={body} stroke={edge} />
        <line x1="6.5" y1="24" x2="49.5" y2="24" stroke={edge} /><circle cx="28" cy="34" r="1.2" fill={dark ? "#aaa" : "#777"} />
        <path d="M18 3c4 0 6 3 6 6s-2 4-3 4v8h-3V12c-2-1-3-3-3-5 0-2 1-4 3-4z" fill={body} stroke={edge} />
        <path d="M38 3c-4 0-6 3-6 6s2 4 3 4v8h3V12c2-1 3-3 3-5 0-2-1-4-3-4z" fill={body} stroke={edge} />
      </svg>; break;
    case "laptop":
      art = <svg viewBox="0 0 70 46" width={size * 1.4} height={size}>
        <defs>{glow}</defs>
        <rect x="9" y="2" width="52" height="34" rx="3" fill={body} stroke={edge} /><rect x="12" y="5" width="46" height="28" rx="1" fill={screenFill} />
        <path d="M2 38h66l-4 6H6z" fill={body} stroke={edge} /><rect x="29" y="38" width="12" height="2" rx="1" fill={edge} />
        <Txt x={35} y={21} w={38} max={12} fs={6.4} />
      </svg>; break;
    case "fold":
      art = <svg viewBox="0 0 52 56" width={size * 0.93} height={size}>
        <defs>{glow}</defs>
        <rect x="1.5" y="1.5" width="49" height="53" rx="5" fill={body} stroke={edge} /><rect x="4" y="4" width="44" height="48" rx="2.5" fill={screenFill} />
        <line x1="26" y1="4" x2="26" y2="52" stroke="rgba(255,255,255,.18)" /><circle cx="38" cy="8" r="1.2" fill="#000" />
        <Txt x={26} y={30} w={36} max={10} fs={6.4} />
      </svg>; break;
    default: {
      // phones: iPhone (dynamic island), Pixel (camera bar), Android / Galaxy (punch hole), Flip (hinge)
      art = <svg viewBox="0 0 32 60" width={size * 0.54} height={size}>
        <defs>{glow}</defs>
        <rect x="1.5" y="1.5" width="29" height="57" rx={k === "iphone" ? 6.5 : 5} fill={body} stroke={edge} />
        <rect x="3.6" y="3.6" width="24.8" height="52.8" rx={k === "iphone" ? 4.8 : 3.4} fill={screenFill} />
        {k === "iphone" && <rect x="11.5" y="5.6" width="9" height="2.8" rx="1.4" fill="#000" />}
        {(k === "android" || k === "phone") && <circle cx="16" cy="7" r="1.3" fill="#000" />}
        {k === "pixel" && <circle cx="16" cy="7" r="1.1" fill="#000" />}
        {k === "flip" && <line x1="3.6" y1="30" x2="28.4" y2="30" stroke="rgba(255,255,255,.2)" />}
        {k === "iphone" && <rect x="11" y="52.6" width="10" height="1" rx=".5" fill="rgba(255,255,255,.55)" />}
        <Txt x={16} y={33} w={21} max={7} fs={5} />
        <rect x="30.4" y="14" width="1.2" height="7" rx=".5" fill={edge} />
      </svg>;
    }
  }
  return <span className={"dev-art k-" + k} title={title || [device, color].filter(Boolean).join(" · ") || "Device"} role="img" aria-label={[LABEL[k], device].filter(Boolean).join(": ")}>{art}</span>;
}
