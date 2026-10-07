// Colour tones for Modo's graphic icon tiles: every page/feature gets its own polished gradient, chosen by
// what it is (sales = green, calls = blue, chat = violet, AI = magenta, money = gold, security = red…).
const T = {
  emerald: ["#34d399", "#059669"], blue: ["#60a5fa", "#2563eb"], violet: ["#a78bfa", "#7c3aed"], fuchsia: ["#f0abfc", "#c026d3"],
  amber: ["#fcd34d", "#d97706"], orange: ["#fdba74", "#ea580c"], rose: ["#fda4af", "#e11d48"], teal: ["#5eead4", "#0d9488"],
  sky: ["#7dd3fc", "#0284c7"], indigo: ["#a5b4fc", "#4f46e5"], slate: ["#cbd5e1", "#475569"], whatsapp: ["#4ade80", "#128c7e"], cyan: ["#67e8f9", "#0891b2"],
};
const RULES = [
  [/whatsapp/i, "whatsapp"], [/sale|order|receipt|budget ?ease|pipeline|deal|revenue|calculator|discount/i, "emerald"],
  [/dial|phone|call|record|listen|quality|qa\b/i, "blue"], [/chat|message|secure line|vault|email|inbox/i, "violet"],
  [/\bai\b|modo ai|builder|train|speech|knowledge|trainer|guide|assist/i, "fuchsia"], [/pay|salary|bonus|wallet|target|leader|progress|reward/i, "amber"],
  [/attend|shift|break|whereabout|kiosk|clock|late/i, "orange"], [/secur|lock|access|user|admin|password|2-step/i, "rose"],
  [/agent|team|people|contact|customer|notepad|crm|department|campaign/i, "sky"], [/task|callback|calendar|lookup|map|track|ups|shipping/i, "teal"],
  [/report|overview|stats|dashboard|what'?s new|update/i, "indigo"], [/drive|backup|file|app|install|windows|connector|setting|setup|plug/i, "slate"],
];
const KEYS = Object.keys(T);
export function toneOf(label = "") {
  const s = String(label);
  for (const [re, k] of RULES) if (re.test(s)) return T[k];
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return T[KEYS[h % KEYS.length]];
}
export const toneStyle = (label) => { const [a, b] = toneOf(label); return { "--g1": a, "--g2": b }; };
