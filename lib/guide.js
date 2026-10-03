// Trainer / in-app guide: every tool in Modo and how to use it.
// role: "admin" | "agent" | "both". `path` deep-links to the actual tool.
// Used by the Guide pages (/admin/guide, /agent/guide) and the global search palette.

export const GUIDE = [
  // ───────────────────────── Floor & sales ─────────────────────────
  { id: "overview", title: "Overview (live floor)", role: "admin", path: "/admin", group: "Floor & sales",
    for: "Your home base: who's on a call now, live subtitles, the dialer, recent calls and today's leaderboard — all on one screen.",
    steps: [
      "Open Overview from the top of the menu.",
      "The top row shows live counts: on calls, working, on break, idle/away.",
      "“Live calls” shows real-time subtitles for anyone using Call assist. Click Listen to hear a call.",
      "“Floor summary” — press Summarise and Modo AI tells you who needs help right now.",
      "“Recent calls” lists finished calls (from Modo, or straight from VICIdial if agents dial there).",
    ],
    tips: ["Click “Listen to all” to monitor every live call at once (newest is unmuted)."] },
  { id: "sales", title: "Sales", role: "admin", path: "/admin/sales", group: "Floor & sales",
    for: "Every sale agents submit lands here for you to verify or reject.",
    steps: ["Open Sales. New ones are marked NEW.", "Click a sale to see the details and the AI check.", "Press Verify or Reject — the agent is notified and the leaderboard updates."] },
  { id: "budgetease", title: "Budget Ease", role: "both", path: "/admin/budgetease", group: "Floor & sales",
    for: "Utility-bill discount signups, kept separate from normal sales.",
    steps: ["Agents submit a signup from their Budget Ease page.", "Admins review them here, same as sales."] },
  { id: "reports", title: "Reports", role: "admin", path: "/admin/reports", group: "Floor & sales",
    for: "Trends over time: sales, pipeline movement and attendance.",
    steps: ["Open Reports and pick a date range.", "Switch between sales, pipeline and attendance views."] },

  { id: "floating", title: "Floating Notepad, Tools & Chats", role: "both", path: "/admin", group: "Floor & sales",
    for: "Three round buttons at the bottom-right of every page open small floating windows you can drag anywhere.",
    steps: ["Notepad (Alt+N): your private scratchpad, saved to your account. Insert the time, copy, download or clear.", "Tools (Alt+T): number check (state, time zone, OK to call), ZIP lookup, US time zones, calculator + discount, call timer, phonetic speller, age/date, text fixer, PIN generator — all free, no keys.", "Chats (Alt+C): reply to any chat without leaving the page. Press the expand icon to open the full chat.", "Drag a window by its title bar; it remembers where you left it. Use – to minimise."] },

  // ───────────────────────── Calls & dialer ─────────────────────────
  { id: "dialer-setup", title: "Dialer setup (VICIdial)", role: "admin", path: "/admin/dialer", group: "Calls & dialer",
    for: "Connect VICIdial (or another dialer), link each agent to their dialer login, and set results & pause codes.",
    steps: [
      "First add the dialer in Connectors → VICIdial (URL, API user, Server IP, Monitor phone).",
      "Come to Dialer setup and link each Modo agent to their VICIdial user.",
      "Set your dispositions (SALE, NI, CALLBK…) and pause codes (BREAK, LUNCH…).",
      "Once linked, an agent's Busy/Away status in Modo pauses their dialer automatically.",
    ],
    tips: ["Listening needs a real phone logged in as your Monitor phone — answer it when it rings to hear the agent."] },
  { id: "listen", title: "Live listen / whisper / barge", role: "admin", path: "/admin", group: "Calls & dialer",
    for: "Monitor a live call: listen silently, whisper to the agent only, or barge in so both sides hear you.",
    steps: [
      "On Overview, find the agent in the Dialer panel (they must be on a call).",
      "Click Listen (silent), Whisper (agent only) or Barge (join).",
      "Your Monitor phone rings — answer it to hear the call.",
    ],
    tips: ["No sound? Your Monitor phone (set in Connectors) must be a registered softphone you can actually answer."] },
  { id: "quality", title: "Call quality (QA)", role: "admin", path: "/admin/quality", group: "Calls & dialer",
    for: "AI review of every call: grammar, nervousness, compliance and a score.",
    steps: ["Open Call quality.", "Pick an agent or a day.", "Read the AI score and notes; flag any call that needs coaching."] },
  { id: "recordings", title: "Call recordings", role: "admin", path: "/admin/recordings", group: "Calls & dialer",
    for: "Play and download VICIdial recordings by day.",
    steps: ["Open Call recordings and pick a date.", "Play any call in the browser or download it.", "Nothing showing? Recording must be ON for the campaign in VICIdial (Recording = ALLCALLS)."] },

  // ───────────────────────── Agent call tools ─────────────────────────
  { id: "agent-dialer", title: "Dialer", role: "agent", path: "/agent/dialer", group: "Your calls",
    for: "Make and manage calls from inside Modo — it controls your VICIdial session for you.",
    steps: [
      "Open Dialer. Type a 10-digit US number and press Dial.",
      "Use Pause/Resume, Hangup, Transfer and DTMF right from the screen.",
      "When a call connects, the customer's details and your last note show automatically.",
      "Set a disposition at the end — it also saves a note (and a callback task if you pick one).",
    ],
    tips: ["Setting your status to Busy or Away pauses the dialer; Available makes it ready again."] },
  { id: "call-assist", title: "Call assist", role: "agent", path: "/agent/call", group: "Your calls",
    for: "Live, on-screen suggestions while you talk — the AI listens and helps.",
    steps: ["Open Call assist before or during a call and allow the microphone.", "Live subtitles appear; the AI suggests what to say and flags objections.", "Your admin can see these subtitles and jump in if you're stuck."] },
  { id: "submit-sale", title: "Submit sale", role: "agent", path: "/agent/sale", group: "Your calls",
    for: "Send a completed sale straight to admin, with an AI check first.",
    steps: ["Open Submit sale and fill in the customer and sale details.", "Press Check with AI to catch mistakes.", "Submit — it goes to admin and counts toward your target once verified."] },

  // ───────────────────────── CRM ─────────────────────────
  { id: "pipeline", title: "Pipeline", role: "both", path: "/admin/pipeline", group: "CRM",
    for: "Your deals as cards in stages — drag them along as they progress.",
    steps: ["Open Pipeline.", "Drag a card to the next stage.", "Click a card to open the customer and add notes."] },
  { id: "contacts", title: "Customers", role: "both", path: "/admin/contacts", group: "CRM",
    for: "Everyone you've talked to, searchable, with their history.",
    steps: ["Open Customers and search by name or phone.", "Open a customer for notes, calls and tasks.", "Add a new customer with the + button."] },
  { id: "notepad", title: "Notepad", role: "both", path: "/admin/notepad", group: "CRM",
    for: "The last note and callback for every customer in one list (admin). Agents have a personal scratchpad.",
    steps: ["Open Notepad.", "Scan the latest note per customer.", "Click through to add or edit."] },
  { id: "email", title: "Email", role: "admin", path: "/admin/email", group: "CRM",
    for: "Email customers from Modo and see what was sent.",
    steps: ["Set up Email (SMTP) in Connectors first.", "Open Email, pick a customer, write and send.", "Sent mail is logged on the customer."] },
  { id: "tasks", title: "Tasks & callbacks", role: "both", path: "/admin/tasks", group: "CRM",
    for: "Who needs to call whom, and when — with pop-up reminders.",
    steps: ["Open Tasks & callbacks.", "Add a callback with a date/time, or complete existing ones.", "Modo rings and pops a reminder when one is due."] },

  // ───────────────────────── Team ─────────────────────────
  { id: "attendance", title: "Attendance", role: "admin", path: "/admin/attendance", group: "Team",
    for: "Who's in — office or remote — with automatic clock-in/out and late tracking.",
    steps: ["Open Attendance.", "See who's clocked in and who was late.", "Approve or deny early shift-end requests here."] },
  { id: "whereabouts", title: "Whereabouts (geofencing)", role: "admin", path: "/admin/whereabouts", group: "Team",
    for: "A live map of who's at the office, with alerts when someone leaves or returns.",
    steps: ["Open Whereabouts.", "Set the office location/radius in Settings if needed.", "Agents' devices report location; you get leave/return alerts."] },
  { id: "agent-notepads", title: "Agent notepads", role: "admin", path: "/admin/notepads", group: "Team",
    for: "Read every agent's personal scratchpad, searchable, export to CSV.",
    steps: ["Open Agent notepads.", "Search across all notes.", "Export to CSV with the button."] },
  { id: "agents", title: "Agents", role: "admin", path: "/admin/agents", group: "Team",
    for: "Add, edit, call and manage agents — including their contract and docking.",
    steps: [
      "Open Agents and press Add to create one (they sign in with the ID and password).",
      "Edit an agent to set their shift, link their dialer user, or edit their confidential contract.",
      "Use Dock to apply a deduction and/or a warning — the agent is notified on their phone.",
      "Use ✨ Generate contract to auto-write a contract from their details.",
    ] },
  { id: "shifts", title: "Shifts", role: "admin", path: "/admin/shifts", group: "Team",
    for: "Everyone's shift times; agents are clocked out automatically at shift end.",
    steps: ["Open Shifts.", "Set start/end per agent.", "Save — auto clock-out follows the end time."] },
  { id: "breaks", title: "Break report", role: "admin", path: "/admin/breaks", group: "Team",
    for: "Every break, per agent per day.",
    steps: ["Open Break report.", "Pick a day or agent to review break lengths."] },
  { id: "payroll", title: "Payroll", role: "admin", path: "/admin/payroll", group: "Team",
    for: "Monthly pay with deductions and bonuses worked out for you.",
    steps: ["Open Payroll and pick the month.", "Review base pay, late deductions, docks and bonuses.", "Export for your records."] },
  { id: "users", title: "Users & admins", role: "admin", path: "/admin/users", group: "Team",
    for: "Create admins and supervisors, reset passwords, and set what a supervisor can see.",
    steps: [
      "Open Users & admins.",
      "Add a user and pick a role: Admin (full) or Supervisor (view-only monitor).",
      "For a supervisor, tick the sections they may see — or use a Preset.",
      "Reset a password or turn on 2-step from each user's row.",
    ],
    tips: ["Supervisors can monitor everything you grant but cannot change anything."] },
  { id: "org", title: "Departments & campaigns", role: "admin", path: "/admin/org", group: "Team",
    for: "Organise teams and campaigns (Budget Ease, Verizon, AT&T…).",
    steps: ["Open Departments & campaigns.", "Add a department or campaign and assign agents."] },
  { id: "access", title: "Agent access", role: "admin", path: "/admin/access", group: "Team",
    for: "Turn agent features on or off (lookups, calculator, call assist, chat, AI, submitting sales…).",
    steps: ["Open Agent access.", "Toggle each feature for agents.", "Changes apply to all agents within a minute."] },
  { id: "kiosk", title: "Office kiosk", role: "admin", path: "/kiosk", group: "Team",
    for: "A check-in screen for the office entrance.",
    steps: ["Open Office kiosk on the entrance device.", "Agents tap in; it feeds Attendance."] },

  // ───────────────────────── Agent progress ─────────────────────────
  { id: "target", title: "Target & leaderboard", role: "agent", path: "/agent/target", group: "Your progress",
    for: "Today's target and where you rank.",
    steps: ["Open Target & leaderboard.", "See your verified sales vs the target and your position."] },
  { id: "my-quality", title: "My call quality", role: "agent", path: "/agent/quality", group: "Your progress",
    for: "AI coaching on every call you take.",
    steps: ["Open My call quality.", "Read the score and tips for each call to improve."] },
  { id: "my-stats", title: "My stats", role: "agent", path: "/agent/reports", group: "Your progress",
    for: "Your own sales and attendance trends.",
    steps: ["Open My stats and pick a range."] },
  { id: "contract", title: "My contract", role: "agent", path: "/agent/contract", group: "Your progress",
    for: "Your welcome message and confidential employment contract.",
    steps: ["Open My contract to read your onboarding message and contract.", "It's private to you and set by admin."] },

  // ───────────────────────── Tools & setup ─────────────────────────
  { id: "lookups", title: "Lookups", role: "both", path: "/admin/lookups", group: "Tools & setup",
    for: "Check a USA phone, ZIP, address or email — plus any lookup API you add.",
    steps: ["Open Lookups.", "Pick the type, type the value and search.", "Admins add more lookups in Connectors → Lookup API."] },
  { id: "calculator", title: "Discount calculator", role: "both", path: "/admin/calculator", group: "Tools & setup",
    for: "Work out a customer's quote and discount in seconds.",
    steps: ["Open the calculator.", "Enter the bill and the plan.", "It applies your discount rules and shows the quote."] },
  { id: "train-ai", title: "Train Modo AI", role: "admin", path: "/admin/train", group: "Tools & setup",
    for: "Teach the AI your prices, script, rules and objection answers so every AI reply fits your business.",
    steps: [
      "Open Train Modo AI.",
      "Fill in Company, Prices, Script, Objections and Rules.",
      "Save — this knowledge is added to Call assist, Modo AI and the AI check.",
    ],
    tips: ["Keep prices exact — the AI is told never to invent numbers."] },
  { id: "connectors", title: "Connectors", role: "admin", path: "/admin/connectors", group: "Tools & setup",
    for: "Plug Modo into other tools: chat & alerts (Slack, Telegram, Teams…), SMS/phone push, AI providers, VICIdial, email, lookups.",
    steps: [
      "Open Connectors — tiles are grouped (Chat & alerts, Phone & SMS, Automation & data, Core services).",
      "Pick one, fill in the fields it shows, and Save.",
      "Press Test to confirm it works; use the event checkboxes to choose what gets sent.",
    ],
    tips: ["For phone alerts that reach a locked phone, add Telegram, ntfy, Pushover or Twilio SMS."] },
  { id: "settings", title: "Settings", role: "admin", path: "/admin/settings", group: "Tools & setup",
    for: "IP lock, break rules, idle limits, targets, company name and the onboarding message.",
    steps: ["Open Settings.", "Adjust the rule you need and Save.", "Use Emergency stop (top-right menu) to lock everyone out instantly."] },
  { id: "windows-app", title: "Windows app", role: "admin", path: "/admin/app", group: "Tools & setup",
    for: "Download the desktop installer and lock down office PCs.",
    steps: ["Open Windows app.", "Download the installer and share it with agents."] },
  { id: "install-phones", title: "Install on phones", role: "both", path: "/install", group: "Tools & setup",
    for: "Add Modo to Android & iPhone with a QR code and steps.",
    steps: ["Open Install on phones.", "Scan the QR on the phone, or follow the Android/iOS steps.", "Allow notifications so alerts reach a locked phone."] },

  // ───────────────────────── Everyone ─────────────────────────
  { id: "chat", title: "Chat & huddles", role: "both", path: "/admin/chat", group: "Everyone",
    for: "Slack-style channels and DMs, voice notes, and one-tap voice huddles.",
    steps: ["Open Chat.", "Pick a channel or start a DM.", "Send a voice note with the mic, or start a huddle to talk live."] },
  { id: "modo-ai", title: "Modo AI", role: "both", path: "/admin/ai", group: "Everyone",
    for: "Ask anything — scripts, objections, or (for admins) questions about your team, sales and pay.",
    steps: ["Open Modo AI.", "Type your question.", "It answers using what you taught it in Train Modo AI."] },
  { id: "status", title: "Your status (Available / Busy / Away)", role: "both", path: "", group: "Everyone",
    for: "Your status controls your dialer and tells the floor what you're doing.",
    steps: ["Click your name (top-right) and pick Available, Busy or Away.", "Busy/Away pauses your dialer; Available makes it ready."] },
  { id: "notifications", title: "Phone alerts", role: "both", path: "", group: "Everyone",
    for: "Get Modo alerts on your phone even when it's locked or the PC is off.",
    steps: ["Tap “Turn on phone alerts” when Modo asks, and Allow.", "Install Modo on your phone (Install on phones) for the best delivery."] },
];

export const GUIDE_GROUPS = [...new Set(GUIDE.map((g) => g.group))];

// Fix a guide item's path to the right role (admin paths double as the canonical link).
export function guideForRole(role) {
  const want = role === "AGENT" ? "agent" : "admin";
  return GUIDE.filter((g) => g.role === "both" || g.role === want).map((g) => {
    let path = g.path;
    if (want === "agent" && path === "/admin") path = "/agent";
    if (want === "agent" && path.startsWith("/admin/")) {
      const agentPath = path.replace("/admin/", "/agent/");
      // Only remap the ones that genuinely exist on the agent side
      const agentPages = ["/agent/pipeline", "/agent/contacts", "/agent/notepad", "/agent/tasks", "/agent/lookups", "/agent/calculator", "/agent/chat", "/agent/ai", "/agent/budgetease", "/agent/reports", "/agent/quality"];
      if (agentPages.includes(agentPath)) path = agentPath;
    }
    return { ...g, path };
  });
}
