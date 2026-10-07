// Modo's own starter speeches. They are used until the admin saves their own (then the admin's list wins),
// and the admin can add them back from AI → Campaign speeches. Plan facts match the Verizon product card
// (lib/providerKnowledge.js) — prices change, so agents confirm the current offer before quoting.

export const VERIZON_SPEECH = {
  id: "modo-verizon",
  campaign: "Verizon", campaignMatch: /verizon/i,
  title: "Verizon — full call (Modo's speech)",
  priority: true, active: true, builtIn: true,
  text: `OPENING (first 10 seconds — smile, slow down, say their name)
"Hi, is this [Customer first name]? … Hi [Name], this is [Your name] with [Company], [our Verizon partnership — e.g. an authorized Verizon retailer], on a recorded line. I'm calling about your Verizon service — do you have two minutes? I promise I'll be quick."
If they ask who you are:
"Of course — I'm [Your name] with [Company], [our Verizon partnership]. I'm here to make sure you're getting the most out of your Verizon plan."

PERMISSION + REASON
"The reason I'm calling: Verizon has changed its plans this year, and a lot of customers are still paying for an older plan when a newer one costs less or gives more. I'd just like to check whether you're on the best one. Fair enough?"

DISCOVERY (ask, then listen — let them talk)
1. "How many lines do you have on the account right now?"
2. "Roughly what's the monthly bill — about how much, give or take?"
3. "What do you use the most — streaming, hotspot, calling Mexico or Canada, travel?"
4. "Any phones that are acting up, or anyone in the house waiting for an upgrade?"
5. "Are you on AutoPay?"
Repeat it back: "So, [X] lines, around $[Y] a month, mostly [use], and [name] needs a new phone. Did I get that right?"

THE PITCH (match the plan to what they told you)
• Wants the lowest bill → "Verizon's new Simplicity plan is one simple price per line with AutoPay — full 5G Ultra Wideband, unlimited talk and text, 10 gigs of hotspot and Mexico/Canada included."
• Heavy data, hotspot or perks → "With myPlan Unlimited Plus you get premium data and a bigger hotspot, and you only pay for the perks you actually want — like Disney+ or Netflix — about $10 each, cancel any time."
• Needs a new phone → "With the right plan, the phone is paid monthly at 0% interest, and trade-in or promo credits come off your bill every month."
Always say the number like this: "That comes to about $[price] a month for [X] lines, plus taxes and fees, with AutoPay." Then stop talking and let them answer.

TRIAL CLOSE
"How does that sound compared to what you're paying now?"
"If I can get that set up for you today, would that work for you?"

OBJECTIONS
• "I'm not interested." → "Totally understand — most people tell me that before they hear the number. Just one quick question: if I could lower the bill or give you more for the same price, would that be worth two minutes?"
• "It's too expensive." → "I hear you. Let's look at it per line — today you're at about $[Y] for [X] lines. With [plan] it's about $[new]. That's $[difference] back in your pocket every month."
• "I'm happy with my plan." → "That's great, and I'm not trying to move you off something that works. I just want to make sure you're not paying more than you need to for the same thing — can I check one number for you?"
• "I need to talk to my spouse." → "Of course — that's smart. When are they usually home? I'll call back so I can explain it to both of you at once."
• "Send me something in writing." → "Absolutely, you should have it in writing. Before I send it, let me make sure it's the right offer for you — how many lines are we talking about?"
• "Is this a scam? How did you get my number?" → "Fair question — you should ask. I'm [Your name] with [Company], [our Verizon partnership], on a recorded line. I'll never ask for your password, PIN or a code sent to your phone, and you'll see everything in writing before you agree."
• "I'm busy right now." → "No problem at all. What's a better time today or tomorrow — morning or evening?"
• "I don't want to change my number." → "You keep your number and your phone — nothing changes except the plan and the price."

RECAP + CONSENT (never skip this)
"Let me recap so you're 100% clear: [plan] for [X] lines, about $[price] a month plus taxes and fees, with AutoPay. [Phone, trade-in or credits — paid monthly over 36 months, if any.] No password or PIN needed from you. Do I have your OK to go ahead?"
Wait for a clear "Yes."

CLOSE
"Perfect, [Name]. You'll get a text and email from Verizon confirming everything. If anything looks different from what we talked about, call me back directly. Thanks for your time — have a great [morning/afternoon/evening]!"`,
  dos: `Introduce yourself, [Company] and our Verizon partnership exactly as written, and say "recorded line".
Use the customer's first name 2–3 times. Smile — they can hear it.
Ask, listen, and repeat back before you pitch.
Say every price as "about $__ a month plus taxes and fees, with AutoPay" — confirm the current offer first.
Recap and get a clear YES before submitting anything.
Set a callback in Modo for every "call me later".`,
  donts: `Never ask for passwords, account PINs, one-time codes, full card numbers or SSNs.
Never call a phone "free" — say "paid off with monthly bill credits" unless the written offer says free.
Never promise a price, gift or credit that isn't on the approved offer.
Never send customers links or tell them to go to a website.
Never pressure, argue or talk over the customer. If they say stop calling, mark Do Not Call.`,
};

export const SEED_SPEECHES = [VERIZON_SPEECH];
