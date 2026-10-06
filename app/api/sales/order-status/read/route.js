import { NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { askFile } from "@/lib/ai";
import { ORDER_STATUSES } from "@/lib/orderFill";
import { friendlyError } from "@/lib/errors";

// Phone flow: read the order status from a screenshot of the carrier's order page using Modo AI (vision).
export async function POST(req) {
  const { error } = await requireManager("sales");
  if (error) return error;
  const f = await req.formData().catch(() => null);
  const file = f?.get("image");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Attach a screenshot." }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "Screenshot is too big (max 4 MB)." }, { status: 400 });
  const mime = file.type || "image/png";
  if (!/^image\//.test(mime)) return NextResponse.json({ error: "That isn't an image." }, { status: 400 });
  const dataB64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  // UPS package screenshot (from the UPS box on a sale)
  if (f.get("kind") === "ups") {
    const STEPS = ["label", "dropped_off", "in_transit", "out_for_delivery", "delivered", "exception", "returned"];
    try {
      const d = await askFile({ mime, dataB64, json: true, maxTokens: 300,
        system: "You read screenshots of UPS package tracking pages. Reply with JSON only.",
        prompt: `Read this UPS tracking screenshot. Reply as JSON: {"step": one of ${JSON.stringify(STEPS)} (Label Created=label, We Have Your Package/Drop-Off=dropped_off, On the Way/In Transit=in_transit, Out for Delivery=out_for_delivery, Delivered=delivered, Delivery Attempted/Exception=exception, Returned=returned), "detail": short text with the status line, latest scan and delivery date (max 150 chars), "trackingNumber": the 1Z number shown or ""}.` });
      const st = STEPS.includes(d?.step) ? d.step : null;
      return NextResponse.json({ upsStatus: st, detail: String(d?.detail || "").slice(0, 200), trackingNumber: String(d?.trackingNumber || "") });
    } catch (e) { return NextResponse.json({ error: /AI key|AI request|couldn't read|can't read/i.test(e.message) ? e.message : friendlyError(e) }, { status: 500 }); }
  }
  try {
    const d = await askFile({ mime, dataB64, json: true, maxTokens: 400,
      system: "You read screenshots of US phone-carrier order-status pages (Verizon, AT&T, T-Mobile). Reply with JSON only.",
      prompt: `Read this order-status screenshot. Reply as JSON: {"status": one of ${JSON.stringify(ORDER_STATUSES)}, "detail": short text with dates, tracking numbers or delivery info shown (max 150 chars), "orderNumber": the order number shown or ""}. If no order status is visible use "Other" and say why in detail.` });
    const status = ORDER_STATUSES.find((x) => x.toLowerCase() === String(d?.status || "").toLowerCase()) || "Other";
    return NextResponse.json({ status, detail: String(d?.detail || "").slice(0, 200), orderNumber: String(d?.orderNumber || "") });
  } catch (e) {
    return NextResponse.json({ error: /AI key|AI request|couldn't read|can't read/i.test(e.message) ? e.message : friendlyError(e) }, { status: 500 });
  }
}
