// Extra built-in training lessons seeded into #modo-training once (admins can edit or delete them).
import { VERIZON_SPEECH } from "./speechSeeds";

// The Verizon speech as a lesson card: CAPS lines become headings, • lines bullets, dos a checklist, don'ts warnings.
const asLesson = (sp) => "! Top priority: learn this speech first. Practise it in your scratchpad (Notepad → My speech) until Modo scores you 80+.\n\n" +
  sp.text.split("\n").map((l) => (/^[A-Z][A-Z +&/()—-]{3,}/.test(l) && !l.startsWith('"') ? "# " + l : l.startsWith("• ") ? "- " + l.slice(2) : l)).join("\n") +
  "\n\n# Always\n" + sp.dos.split("\n").map((l) => "[ ] " + l).join("\n") + "\n\n# Never\n" + sp.donts.split("\n").map((l) => "! " + l).join("\n");
export const SEED_LESSONS = [
  { key: "lesson-verizon-speech", title: "★ Verizon speech — learn this first", body: asLesson(VERIZON_SPEECH) },
  {
    key: "lesson-us-slang",
    title: "Everyday American English: slang customers use",
    body: `! Learn to understand these. Use the friendly, safe ones yourself, but stay polite and professional: no swearing, and don't copy slang that doesn't sound natural for you. If you don't understand something, it's fine to say "Sorry, could you say that another way?"

# Greetings and small talk
"How's it going?" / "What's up?" / "How you doing?"
- Means "Hello, how are you?" Answer briefly: "Doing great, thanks! How about you?"
- "Hey there" / "Hi there": friendly hello
- "Long time no see": we haven't spoken in a while
- "Have a good one": have a good day (reply: "You too!")
- "Take care" / "Talk soon": goodbye

# Yes, no and agreeing
- "Yeah" / "Yep" / "Yup" / "Uh-huh": yes
- "Nope" / "Nah" / "Uh-uh": no
- "Sure thing" / "You got it" / "Absolutely": yes, happy to
- "For sure" / "Totally" / "Definitely": strong yes
- "Sounds good" / "Works for me" / "I'm down": I agree
- "I'm good" / "I'm all set": no thanks, I don't need anything (this is a polite NO, not "I am fine")
- "Fair enough": I accept that
- "My bad": my mistake, sorry
- "No worries" / "No problem" / "All good": it's okay

# Money and bills (very common on our calls)
- "Bucks": dollars ("forty bucks" = $40)
- "A grand": $1,000
- "Pricey" / "A rip-off": too expensive
- "A steal" / "A good deal": cheap for what you get
- "Break the bank": cost too much ("I can't break the bank right now")
- "Tight on money" / "Money's tight" / "Strapped for cash": low on money
- "What's the catch?": what hidden cost or condition is there? Answer honestly with the real terms
- "Nickel and dime": charging lots of small extra fees
- "Ballpark" / "Ballpark figure": a rough number ("Give me a ballpark") — say it's approximate and confirm before quoting
- "Bottom line": the final total, or the main point

# Time and timing
- "Gimme a sec" / "Hang on" / "Hold on": wait a moment
- "Right now" / "ASAP": immediately
- "In a bit" / "In a few": soon, in a few minutes
- "Swamped" / "Slammed": very busy (offer to call back)
- "I'm on the go": busy, moving, can't talk long
- "Call me back later" / "Hit me up later": call another time — ask what time works and honor it

# Not interested / pushing back (always respect these)
- "I'm not interested" / "Not right now" / "I'll pass": no — thank them; don't push
- "Take me off your list" / "Stop calling me": opt out. Confirm and add to Do Not Call. Never argue
- "I'm happy with what I've got": satisfied with their provider
- "Let me think about it" / "Let me sleep on it": wants time to decide — that's fine; offer written terms
- "I need to run it by my wife/husband": wants to ask their partner first
- "Sounds too good to be true" / "Is this a scam?": suspicious. Say clearly who you are, why you called, and that nothing happens without their OK

# Feelings and reactions
- "Awesome" / "Cool" / "Sweet" / "Great": good
- "That sucks" / "That's a bummer": that's bad, disappointing (reply: "I'm sorry to hear that")
- "I'm fed up" / "I've had it": very frustrated (stay calm, show you understand)
- "Ticked off" / "Pissed (off)": angry (don't repeat the word; say "I understand you're upset")
- "Freaking out": very worried
- "No way!": surprise, or "absolutely not" — depends on tone
- "Seriously?" / "Are you kidding me?": annoyed or surprised
- "Whatever": I don't care (often annoyed)

# Understanding and confusion
- "Gotcha" / "Got it": I understand
- "I'm lost" / "You lost me": I don't understand — explain more simply
- "What do you mean?" / "Come again?": please repeat or explain
- "Makes sense": I understand and agree
- "Long story short": to make it quick
- "Spell it out for me": explain clearly and simply

# Phone and tech words
- "Cell" / "Cell phone": mobile phone
- "Carrier" / "Provider": phone company (Verizon, AT&T, T-Mobile)
- "Bars" / "No bars": signal strength / no signal
- "Dropped call": call cut off
- "Data" / "Running out of data": mobile internet
- "Wi-Fi is down": home internet not working
- "Text me" / "Shoot me a text": send an SMS
- "Upgrade": get a newer phone
- "Switch" / "Port my number": move to another carrier keeping the number

# American details that help on calls
- Dates are month/day/year: 10/07/2026 = October 7, 2026
- ZIP code = postal code (5 digits); state names are often said as two letters (TX = Texas, NY = New York, CA = California)
- Time zones: Eastern (ET), Central (CT), Mountain (MT), Pacific (PT). Pacific is 3 hours behind Eastern
- "Ma'am" and "Sir" are polite and fine; first names are also normal once the customer offers theirs
- Americans say "Social" for Social Security number — we never ask for it

# Phrases that sound natural for agents
"Thanks for hanging in there."  (thanks for waiting)
"Totally understand."
"Let me double-check that for you."
"Just to make sure I've got this right…"
"I don't want to waste your time, so here's the quick version."
"Is there anything else I can help you with today?"
"Thanks so much, have a great rest of your day!"

# Quick self-check
[ ] I know "I'm good" usually means "no thanks"
[ ] I respect "not interested" and "stop calling" right away
[ ] I can say a price as "about forty bucks" and still confirm the exact amount
[ ] I know US dates are month/day/year
[ ] I stay polite even when the customer uses strong words`,
  },
];
