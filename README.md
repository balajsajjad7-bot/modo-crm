# CRM Modo

Agent attendance, per-second late deductions, secure sale submission with AI summaries, live call assist, and VICIdial floor status.

## Set up (Windows, one time)
1. Unzip to `C:\dev\crm-modo`, open a terminal there.
2. Copy `.env.example` to `.env` and fill it in:
   - `DATABASE_URL` – create a free project at neon.tech, copy the connection string.
   - `JWT_SECRET` – any long random text.
   - `AI_API_KEY` – free Gemini key from aistudio.google.com/apikey.
   - `VICIDIAL_*` – see below. Leave blank until ready.
   - `ADMIN_PASSWORD` – your admin password.
3. Run:
   ```
   npm install
   npm run db:push
   npm run seed
   npm run dev
   ```
4. Open http://localhost:3000 and sign in with `ADMIN` + your password.

## Database connection
The app talks to Neon over HTTPS/WebSockets (port 443) using Neon's serverless driver, so it works on networks
that block or drop the normal Postgres port. The only command that still uses port 5432 is `npm run db:push`
(creating/updating tables). If it can't connect, run it once on a different network (e.g. mobile hotspot).
Daily start: double-click `start-crm.bat`. After downloading a new version, double-click `update-crm.bat` once.

## Deploy (Netlify)
Push to a new GitHub repo, import it in Netlify, and paste every line from `.env` into
Site settings → Environment variables. Never commit `.env`.

## Connecting VICIdial
1. In VICIdial admin, create a new user just for this (e.g. `crmapi`), user level 8+, with **API Access = 1**
   and **API List Allowed** containing `logged_in_agents`.
2. If your VICIdial restricts API by IP, allow your Netlify site (or disable the restriction for that user).
3. Put the server URL and that user's login in `VICIDIAL_URL`, `VICIDIAL_API_USER`, `VICIDIAL_API_PASS`.
4. In each agent's profile, set **VICIdial user** to their dialer login so you can match them.

## How the money works
- Per day = monthly salary ÷ 26. Per hour = per day ÷ shift length. Per second = per hour ÷ 3600.
- An agent is clocked in at their first sign-in of the shift. Late seconds × per-second rate is deducted.
  Within the grace period nothing is deducted; past it, the whole late time counts.
- A working day with no sign-in deducts one full day. Night shifts that cross midnight belong to the day they started.
- Admin can waive any late deduction from Payroll → Days.

## Breaks, targets, IP lock, idle (Admin > Settings)
- **Break allowance** (default 60 min/shift). Agents press Start/End break; time over the allowance is deducted per second.
- **Daily target + bonus**: each verified sale above the target earns the bonus. Shown on the agent screen and in Payroll.
- **Office IP lock**: agents can only sign in from listed IPs. Tap "Add my current IP" while at the office.
  If your office internet has a dynamic IP, ask the ISP for a static IP or the lock will need updating when it changes.
- **Idle detection**: logs when an agent leaves the CRM tab or has no mouse/keyboard activity for the set minutes.
  Time on break isn't counted. Idle time is logged for review, not deducted.

## Sales checks
- **Duplicate check**: a sale with the same phone number or customer name as another non-rejected sale in the last 90 days is flagged.
- **AI call scoring**: when an agent ends a call (30+ words spoken), the AI scores greeting, pitch, disclosure and closing out of 100.
  Agents see their last score and coaching; admin sees every score on the Floor tab.

## Updating an existing install
After replacing the files, stop the dev server and run `npm run db:push` once to add the new tables.

## Design
Navigation is a macOS-style magnification dock (`components/Dock.js`, built with framer-motion + lucide-react)
fixed to the bottom of the screen. Admin: Floor, Sales (badge = new sales), Agents, Payroll, Settings, theme, sign out.
Agent: shift, break toggle, target, sale, call assist (turns red while live), theme, end shift.
Light and dark mode follow the device and can be switched from the dock.

## Pages
Every function has its own page. Admin: `/admin` (floor), `/admin/sales`, `/admin/agents`, `/admin/payroll`,
`/admin/chat`, `/admin/settings`. Agent: `/agent` (shift and breaks), `/agent/target`, `/agent/sale`,
`/agent/call`, `/agent/chat`. The dock and any running call stay put while you switch pages.

## Chat, voice notes, attachments, calls
- Everyone is in the **Everyone** room. Anyone can start a direct message or a named group (+ button).
- Voice notes: tap the mic, tap send. Up to about 4 minutes. Files and images up to 4 MB, stored in your Neon database
  (the free tier has 0.5 GB, so clear out old files now and then if you share a lot).
- Only people in a conversation can open its files.
- **Calls and huddles** (audio): admin taps **Call** in a direct message or **Start huddle** in a group.
  Members get a banner with a ring and a **Join** button on any page. Mute, leave, or (admin) end for all.
  Calls are peer-to-peer (WebRTC). They need https or localhost and microphone permission.
  Mesh calls work best up to about 6 people. On strict office networks add a free TURN server
  (TURN_URL / TURN_USER / TURN_PASS in `.env`, e.g. metered.ca's free tier).
- New tables are created with `npm run migrate` (works over HTTPS; `update-crm.bat` runs it for you).

## Live call assist
Works in Chrome or Edge on a computer. It hears the agent's own microphone only (not the customer).
Hearing both sides needs audio from the VICIdial/Asterisk server and a paid speech-to-text service.
Tell customers calls may be monitored; several US states require it.
