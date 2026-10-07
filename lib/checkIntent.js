// The order-status return page saves by itself only when this browser just opened the check for that sale
// from Modo (so another website can't make a signed-in admin save a fake status by sending them a link).
export function markCheck(id) { try { const m = JSON.parse(localStorage.getItem("modo-check-intent") || "{}"); m[id] = Date.now(); localStorage.setItem("modo-check-intent", JSON.stringify(m)); } catch {} }
export function hasCheck(id) { try { const t = JSON.parse(localStorage.getItem("modo-check-intent") || "{}")[id]; return !!t && Date.now() - t < 45 * 60000; } catch { return false; } }
