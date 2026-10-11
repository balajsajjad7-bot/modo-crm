"use client";
// One-page welcome letter for a new hire: congratulations, Modo login (ID + password), first day, English
// Assessment results and first steps. Built in the browser with pdf-lib, so the password goes straight into the
// download and is never stored anywhere.
const CEFR_TEXT = { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-intermediate", C1: "Advanced", C2: "Near-native" };
const SKILLS = [["speaking", "Speaking"], ["listening", "Listening"], ["reading", "Reading"], ["writing", "Writing"], ["fluency", "Fluency"], ["pronunciation", "Pronunciation"]];

// Standard PDF fonts only know Western characters: swap the rest so the PDF never fails.
const clean = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

export async function buildWelcomeLetter({ letter, password, origin }) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(clean(`Welcome to ${letter.company} - ${letter.name}`)); doc.setAuthor(clean(letter.company)); doc.setCreator("Modo");
  const page = doc.addPage([595.28, 841.89]); const W = 595.28, H = 841.89, M = 44;
  const F = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold), MONO = await doc.embedFont(StandardFonts.CourierBold);
  const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const C = { ink: hex("#0f1222"), mute: hex("#5b6478"), line: hex("#e4e6ef"), card: hex("#f6f5fd"), violet: hex("#7c3aed"), blue: hex("#2563eb"), deep: hex("#1e1b4b"), green: hex("#059669"), white: rgb(1, 1, 1), soft: hex("#c4b5fd") };
  const text = (t, x, y, { size = 11, font = F, color = C.ink } = {}) => page.drawText(clean(t), { x, y, size, font, color });
  const width = (t, size, font = F) => font.widthOfTextAtSize(clean(t), size);
  const wrap = (t, size, maxW, font = F) => { const out = []; let line = ""; for (const w of clean(t).split(/\s+/)) { const tryL = line ? line + " " + w : w; if (width(tryL, size, font) > maxW && line) { out.push(line); line = w; } else line = tryL; } if (line) out.push(line); return out; };
  const para = (t, x, y, size, maxW, opts = {}) => { const lines = wrap(t, size, maxW, opts.font); lines.forEach((l, i) => text(l, x, y - i * size * 1.45, { size, ...opts })); return y - lines.length * size * 1.45; };
  const rr = (x, yTop, w, h, r, color, border) => page.drawSvgPath(`M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`, { x, y: yTop, color, ...(border ? { borderColor: border, borderWidth: 0.8 } : {}) });
  const first = clean(letter.name).split(" ")[0] || "there";
  const when = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // Header band
  page.drawRectangle({ x: 0, y: H - 190, width: W, height: 190, color: C.deep });
  page.drawRectangle({ x: 0, y: H - 190, width: W, height: 5, color: C.violet });
  page.drawRectangle({ x: W * 0.55, y: H - 190, width: W * 0.45, height: 5, color: C.blue });
  page.drawCircle({ x: W - 60, y: H - 30, size: 110, color: hex("#312e81"), opacity: 0.55 });
  page.drawCircle({ x: W - 10, y: H - 120, size: 60, color: hex("#4338ca"), opacity: 0.35 });
  page.drawRectangle({ x: 0, y: H - 260, width: W, height: 70, color: C.white }); // keep the circles inside the band
  rr(M, H - 40, 30, 30, 8, C.violet); text("M", M + 8.5, H - 61, { size: 17, font: B, color: C.white });
  text(clean(letter.company).toUpperCase(), M + 40, H - 60, { size: 13, font: B, color: C.white });
  const tag = "WELCOME LETTER"; text(tag, W - M - width(tag, 9, B), H - 52, { size: 9, font: B, color: C.soft });
  const dt = when(letter.hiredAt); text(dt, W - M - width(dt, 9), H - 65, { size: 9, color: C.soft });
  text(`Congratulations, ${first}!`, M, H - 125, { size: 30, font: B, color: C.white });
  text(`Welcome to the ${letter.company} team.`, M, H - 155, { size: 14, color: C.soft });

  // Letter
  let y = H - 228;
  text(`Dear ${clean(letter.name)},`, M, y, { size: 11.5, font: B }); y -= 22;
  y = para(`We are delighted to welcome you as our new ${letter.role}. You showed us great English, a professional attitude and the right energy for US customers, and we can't wait to see you on the floor. Everything you need for your first day is below.`, M, y, 11, W - 2 * M, { color: C.mute }) - 16;

  // Login card + first day card
  const colW = (W - 2 * M - 14) / 2, cardH = 132, top = y;
  rr(M, top, colW, cardH, 12, C.card, C.line);
  text("YOUR MODO LOGIN", M + 16, top - 24, { size: 9, font: B, color: C.violet });
  const link = `${origin || ""}/login`;
  text("Sign in at", M + 16, top - 44, { size: 8.5, color: C.mute }); text(link.replace(/^https?:\/\//, ""), M + 16, top - 57, { size: 10, font: B });
  text("Agent ID", M + 16, top - 77, { size: 8.5, color: C.mute }); text(letter.agentId || "-", M + 16, top - 92, { size: 15, font: MONO, color: C.ink });
  text("Password", M + 16 + colW / 2 - 8, top - 77, { size: 8.5, color: C.mute });
  if (password) text(password, M + 16 + colW / 2 - 8, top - 92, { size: 13, font: MONO, color: C.green });
  else text("Given to you separately", M + 16 + colW / 2 - 8, top - 90, { size: 9, color: C.mute });
  para("Keep this private - never share your password with anyone.", M + 16, top - 112, 8, colW - 32, { color: C.mute });

  const x2 = M + colW + 14;
  rr(x2, top, colW, cardH, 12, C.card, C.line);
  text("YOUR FIRST DAY", x2 + 16, top - 24, { size: 9, font: B, color: C.violet });
  const row = (label, val, yy) => { text(label, x2 + 16, yy, { size: 8.5, color: C.mute }); text(val, x2 + 16, yy - 13, { size: 11, font: B }); };
  row("Role", letter.role, top - 44);
  row("Start date", letter.startDate ? when(letter.startDate) : "We'll confirm with you", top - 77);
  row("Shift starts", `${letter.shiftStart} (Pakistan time)`, top - 110 + 0);
  y = top - cardH - 18;

  // English Assessment
  const r = letter.result;
  const aH = r ? 150 : 72; rr(M, y, W - 2 * M, aH, 12, C.white, C.line);
  text("YOUR MODO ENGLISH ASSESSMENT", M + 16, y - 24, { size: 9, font: B, color: C.violet });
  if (r) {
    const cx = M + 70, cy = y - 72;
    page.drawCircle({ x: cx, y: cy, size: 36, color: C.violet });
    page.drawCircle({ x: cx, y: cy, size: 31, color: hex("#6d28d9") });
    const sc = String(r.score); text(sc, cx - width(sc, 26, B) / 2, cy - 4, { size: 26, font: B, color: C.white });
    text("of 80", cx - width("of 80", 8) / 2, cy - 17, { size: 8, color: C.soft });
    const lvl = `CEFR ${r.cefr}`; text(lvl, cx - width(lvl, 11, B) / 2, cy - 52, { size: 11, font: B });
    const lt = CEFR_TEXT[r.cefr] || ""; text(lt, cx - width(lt, 8.5) / 2, cy - 64, { size: 8.5, color: C.mute });
    const bx = M + 150, bw = W - M - 16 - bx - 30; let by = y - 46;
    for (const [k, l] of SKILLS) {
      const v = r.skills?.[k]; if (v == null) continue;
      text(l, bx, by, { size: 9, color: C.mute });
      rr(bx + 82, by + 8, bw - 82, 7, 3.5, hex("#ede9fe"));
      const fw = Math.max(7, (bw - 82) * Math.max(0, Math.min(1, (v - 20) / 60)));
      rr(bx + 82, by + 8, fw, 7, 3.5, C.violet);
      text(String(v), bx + bw + 8, by, { size: 9, font: B });
      by -= 17;
    }
  } else {
    para("No assessment on file yet - you can take it any time from the link the recruiter sends you.", M + 16, y - 46, 10, W - 2 * M - 32, { color: C.mute });
  }
  y -= aH + 22;

  // First steps
  text("Your first steps in Modo", M, y, { size: 13, font: B }); y -= 20;
  const steps = ["Sign in with your Agent ID and password - your shift starts the moment you sign in.", "Open My contract, read it and sign it on screen.", "Go to Notepad > My scratchpad > My speech and practise the campaign speech until you score 80.", "Say hello to the team in Chat > #general and check #wins for the latest wins."];
  steps.forEach((s, i) => {
    page.drawCircle({ x: M + 8, y: y + 3.5, size: 8, color: C.violet });
    text(String(i + 1), M + 8 - width(String(i + 1), 8.5, B) / 2, y + 0.5, { size: 8.5, font: B, color: C.white });
    y = para(s, M + 24, y, 10, W - 2 * M - 24) - 6;
  });

  // Signature + footer
  y -= 14;
  text("With best wishes,", M, y, { size: 10.5, color: C.mute }); y -= 18;
  text(letter.signer, M, y, { size: 13, font: B }); y -= 15;
  text(`${letter.company} - Recruitment`, M, y, { size: 10, color: C.mute });
  page.drawRectangle({ x: 0, y: 0, width: W, height: 34, color: C.card });
  text(password ? "Confidential - this letter contains your personal login. Don't share it." : `${letter.company} - welcome to the team.`, M, 13, { size: 8, color: C.mute });
  const pm = "Made with Modo"; text(pm, W - M - width(pm, 8), 13, { size: 8, color: C.mute });

  return doc.save();
}

export async function downloadWelcomeLetter(opts) {
  const bytes = await buildWelcomeLetter(opts);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a"); a.href = url; a.download = clean(`Welcome-${opts.letter.name}-${opts.letter.company}`).replace(/\s+/g, "-") + ".pdf"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
