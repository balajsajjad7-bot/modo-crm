"use client";
// The WhatsApp / #modo-bot commands, kept in one place (inbox, Setup → WhatsApp).
import { BookOpen } from "lucide-react";

export const COMMANDS = [
  ["YES", "Send Modo's suggested reply to the customer (YES 12 for reply #12)"],
  ["NO", "Don't send it (the chat stays in the inbox)"],
  ["say your words", "Send your own reply instead — e.g. say Your phone ships Monday 🙂"],
  ["drafts", "List every customer waiting for your OK"],
  ["rules", "Show what Modo may and may never say to customers"],
  ["rule say: …", "Add something Modo should say — e.g. rule say: our hours are 9am–9pm ET"],
  ["rule never: …", "Add something Modo must never say — e.g. rule never: mention the activation fee"],
  ["links off / links on", "Block or allow links in Modo's replies (off by default)"],
  ["mode ask / auto / off", "Ask me first · reply by itself inside the rules · AI off"],
  ["sales · online · late · callbacks · brief · coach", "Live floor reports"],
  ["1Z… #order", "Add a UPS tracking number to a sale"],
  ["remind Ali to call John 8pm", "Modo Agent: tasks, callbacks, messages to agents, sale status, find customer"],
  ["whatsapp John Smith: text", "Message a customer (asks YES first)"],
  ["help", "The full list on your phone"],
];

export default function WaCommands() {
  return (
    <section className="panel stack">
      <b className="row" style={{ gap: 6 }}><BookOpen size={15} /> Commands — text these to your business WhatsApp from an admin number (or type them in Chat → #modo-bot)</b>
      <div className="wai-cmds">
        {COMMANDS.map(([c, h]) => <div key={c} className="wai-cmd"><code>{c}</code><span>{h}</span></div>)}
      </div>
      <p className="muted small" style={{ margin: 0 }}>How a customer reply works: a customer writes → Modo writes a reply (no links, only your rules) → you get it on WhatsApp and here → answer <b>YES</b>, <b>NO</b> or <b>say …</b>. If you or an agent replied in the last 30 minutes, Modo stays quiet.</p>
    </section>
  );
}
