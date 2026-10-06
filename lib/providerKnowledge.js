// Product knowledge for the providers the floor talks about. Seeded into #modo-training as
// "Product knowledge" lessons (one per provider) the first time Modo starts after this update.
// Admins can edit or delete them in Chat → #modo-training or Product knowledge; Modo AI always reads them.
// Prices change often: every card says when it was checked and tells agents to confirm before quoting.
export const KNOWLEDGE_CHECKED = "Oct 2026";

export const PROVIDER_KNOWLEDGE = [
  {
    key: "kb-verizon-wireless",
    provider: "Verizon",
    title: "Verizon Wireless: plans, perks and phones",
    body: `! Checked ${KNOWLEDGE_CHECKED}. Verizon changes prices and promos often. Confirm the current price and terms on verizon.com (or the approved offer sheet) before quoting. We are not Verizon unless we are an authorised Verizon partner for this campaign; say who you really are.

# Plans sold now
Verizon sells two plan families side by side: Simplicity (launched June 16, 2026) and myPlan.
- Simplicity: one flat plan. $45/line, or $30/line as a promo for people switching from another carrier, with AutoPay, plus taxes and fees. Full 5G Ultra Wideband with no upcharge, unlimited talk and text, 10GB hotspot (unlimited hotspot add-on about $15/line), Mexico/Canada calling and roaming, satellite texting on select Android phones, Call Filter and Verizon Family included
- Simplicity device add-ons: Simplicity Plus (about $35/mo, phones roughly $350–$830) and Simplicity Pro (about $50/mo, phones roughly $830–$1,200), upgrade-eligible after paying about a third of the device
- myPlan Unlimited Welcome: about $65 for 1 line, lower per line with more lines. Unlimited data on 5G/4G LTE, no hotspot, SD streaming, Mexico/Canada use
- myPlan Unlimited Plus: about $80 for 1 line. Unlimited premium data, full-speed 5G Ultra Wideband, 30GB hotspot, 50% off one watch/tablet plan
- myPlan Unlimited Ultimate: about $95 for 1 line. Unlimited premium data, 200GB hotspot, international data in 210+ countries, 50% off two connected-device plans
- More lines = lower price per line (about $27.50–$57.50/line at 4 lines on myPlan, depending on plan and promos)

# Perks and add-ons
- myPlan perks are about $10/mo each, cancel any time (examples: Disney+/Hulu/ESPN+ bundle, Netflix & Max, YouTube Premium, Apple One, 3TB cloud, Travel Pass days)
- Simplicity uses themed add-on bundles of about $20–$30/mo (streaming, cloud, hotspot, travel)
- Verizon Loyalty (in the Verizon app): no activation or upgrade fees for members, 3% back each month in Verizon Dollars, daily Verizon Shine offers and sweepstakes

# Phones and paying for them
- Current Apple line-up includes iPhone 18 Pro / Pro Max (released Sept 2026; iPhone 18 Pro 256GB about $1,199.99), iPhone 17 series, iPhone Air and older models. Android: Samsung Galaxy, Google Pixel, Motorola and more
- Device payment: 0% APR monthly payments, usually 36 months (48 on some plans); some phones/promos need a specific plan
- Bring your own phone: allowed if it's unlocked and compatible
- Trade-in and "free phone" promos come as monthly bill credits over the payment term and usually need a specific plan and staying on that plan. Never call a phone "free" unless the written offer says so (see the call guide)

# Verizon-owned brands (prepaid, cheaper)
- Visible: Verizon's online-only prepaid brand
- Total Wireless, Straight Talk, Tracfone, Walmart Family Mobile: prepaid brands Verizon owns, on Verizon's network
- Verizon Prepaid: Verizon's own prepaid plans with loyalty discounts the longer you stay

# Talking points that are accurate
- Verizon's network is consistently rated among the most reliable in the US, especially outside big cities
- 5G Ultra Wideband (UWB) is Verizon's fastest 5G; it's in parts of cities, not everywhere
- Price guarantees, perks and promos have fine print: always read the terms to the customer before they agree`,
  },
  {
    key: "kb-verizon-home",
    provider: "Verizon",
    title: "Verizon Home Internet: Fios, 5G Home and bundles",
    body: `! Checked ${KNOWLEDGE_CHECKED}. Availability depends on the address. Check the customer's address on verizon.com before promising a plan or speed.

# Fios (fiber)
- Fiber to the home, mainly in the Northeast and Mid-Atlantic (e.g. NY, NJ, PA, MA, MD, VA, DC area)
- Verizon completed its purchase of Frontier in January 2026, adding Frontier's fiber areas (about 30 million homes and businesses total); Frontier customers may still see Frontier branding during the changeover
- Plans from Fios 300 Mbps up to Fios 1 Gig, 2 Gig and 5 Gig; 300 Mbps from about $30/mo with a Verizon mobile plan and AutoPay
- Price guarantee: about 3 years on most plans, 5 years on Fios 5 Gig
- Promos can include gift cards, a Ring security bundle on gig plans, and Disney+/Hulu/ESPN+ for 12 months

# 5G Home Internet
- Wireless home internet over Verizon's 5G network; plug-and-play router, no annual contract
- From about $35/mo with a Verizon mobile plan and AutoPay, 3-year price guarantee
- Can include up to $500 to cover the early termination fee from the customer's old provider (check current terms)

# Home Internet Lite / LTE Home
- For areas without Fios or 5G Home; for light, everyday use. From about $35/mo with a mobile plan; Lite Extra has a 4-year price guarantee

# Bundles
- Verizon One: mobile + home internet on one bill, starting around $70/mo
- Simplicity customers can add home internet from about $35/mo
- Bundle discounts need an active Verizon mobile phone line and AutoPay; if the mobile line is cancelled, the home price goes up`,
  },
  {
    key: "kb-att",
    provider: "AT&T",
    title: "AT&T: wireless plans, Fiber and Internet Air",
    body: `! Checked ${KNOWLEDGE_CHECKED}. Confirm current prices on att.com before quoting. Never say you are AT&T unless we are authorised for this campaign.

# Unlimited plans (launched March 13, 2026)
Prices with AutoPay, plus taxes and fees. Customers can mix plans on one account. Line activation fee up to $50.
- Value 2.0: $50 for 1 line, about $30/line at 4 lines. Unlimited 4G LTE/5G data, 5GB premium data, 3GB hotspot, texting to 200+ countries, ActiveArmor security (replaced Starter SL)
- Extra 2.0: $70 for 1 line, about $40/line at 4 lines. 100GB premium data, 50GB hotspot (replaced Extra EL)
- Premium 2.0: $90 for 1 line, about $55/line at 4 lines. Unlimited premium data, 100GB hotspot, 50% off one watch/tablet plan per line (replaced Premium PL)
- All three include Mexico and Canada talk, text and data
- Old plans (Unlimited Starter SL, Extra EL, Premium PL) are not moved automatically; customers on them keep them until they change

# Home internet
- AT&T Fiber: fiber internet in many cities, from about 300 Mbps up to multi-gig plans; no annual contract, equipment included
- AT&T Internet Air: wireless home internet over AT&T's 5G/4G network for areas without fiber
- Bundling AT&T wireless with AT&T Fiber or Internet Air gives a monthly discount

# Prepaid
- Cricket Wireless: AT&T's prepaid brand on AT&T's network
- AT&T Prepaid: AT&T's own prepaid plans`,
  },
  {
    key: "kb-tmobile",
    provider: "T-Mobile",
    title: "T-Mobile: Essentials, Experience plans and home internet",
    body: `! Checked ${KNOWLEDGE_CHECKED}. Confirm current prices on t-mobile.com before quoting.

# Plans (2.0 line-up launched August 2026)
- Essentials 2.0: unlimited talk and text, 50GB premium data, T-Mobile Tuesdays perks; no price guarantee
- Experience More 2.0: unlimited premium data, high-speed data in 215+ destinations, mobile hotspot, Netflix on Us, Apple TV for $3/mo, 5-year price guarantee
- Experience Beyond 2.0: everything in More plus T-Satellite, Hulu + Netflix + MLB.TV on Us, about 250GB hotspot, 5-year price guarantee. About $105 for 1 line ($100 with AutoPay), $170 for 2 lines, 3rd line free with 2, about $54/line at 4 lines
- AutoPay discount is $5 per line; device payments up to 36 months
- Student plan with perks: about $30/mo with AutoPay

# Home internet and other brands
- T-Mobile 5G Home Internet and T-Mobile Fiber (in select areas)
- Metro by T-Mobile and Mint Mobile: prepaid brands on T-Mobile's network
- Sprint was merged into T-Mobile; old Sprint customers are now T-Mobile customers`,
  },
  {
    key: "kb-other-providers",
    provider: "Other providers",
    title: "Other providers: cable, fiber, satellite TV and prepaid brands",
    body: `! General product knowledge, not prices. Look up the current offer on the provider's own site before quoting anything.

# Cable and fiber internet
- Xfinity (Comcast): cable internet, TV and Xfinity Mobile (runs on Verizon's network). Available in much of the country
- Spectrum (Charter): cable internet with no data caps, TV, and Spectrum Mobile (runs on Verizon's network)
- Cox: cable/fiber internet, TV and Cox Mobile (on Verizon's network), mainly in the South and West
- Optimum (Altice): cable/fiber internet in NY, NJ, CT and parts of the South; Optimum Mobile
- Frontier: fiber internet in many states; Verizon completed buying Frontier in January 2026, so Frontier fiber is now part of Verizon
- CenturyLink / Quantum Fiber (Lumen): DSL and fiber internet in many western and central states
- Google Fiber: fiber in select cities

# Satellite and streaming TV
- DIRECTV and DISH: satellite TV (and streaming versions)
- Starlink: satellite internet, useful in rural areas

# Other mobile carriers and prepaid brands (and whose network they use)
- On Verizon: Visible, Total Wireless, Straight Talk, Tracfone, Xfinity Mobile, Spectrum Mobile, Cox Mobile
- On AT&T: Cricket Wireless, AT&T Prepaid
- On T-Mobile: Metro by T-Mobile, Mint Mobile, Google Fi (mainly)
- Multi-network: US Mobile, Boost Mobile (own network plus AT&T roaming), Consumer Cellular (AT&T and T-Mobile)
- Regional: UScellular (wireless business now part of T-Mobile)

# Bills and payments
- Customers can pay any of these providers in their own app or website, by AutoPay, in store, or at authorised payment locations
- We never take a customer's provider password, one-time code, or account PIN on a call`,
  },
  {
    key: "kb-glossary",
    provider: "Glossary",
    title: "Phone and internet terms to explain to customers",
    body: `! Plain-English meanings agents can use on calls.

# Data
- Premium data: high-priority data. After using it up, data still works but can slow down when the network is busy (deprioritized)
- Unlimited data: you won't be cut off or charged extra for data, but speeds can slow after the premium amount
- Mobile hotspot: using your phone's data to get a laptop or tablet online; usually has its own high-speed limit
- 5G Ultra Wideband / 5G UC: the fastest 5G, mainly in busy city areas
- Satellite texting: send texts with no cell signal, on supported phones

# Bills and contracts
- AutoPay discount: lower monthly price for paying automatically; many carriers require a debit card or bank account for the discount
- Price guarantee / price lock: the plan price won't go up for that period; taxes, fees and add-ons can still change
- Activation fee: one-time charge per new line (often waived for loyalty members or online orders)
- Device payment / installment plan: phone paid monthly with 0% APR over 24–48 months; leaving early means paying off the remaining balance
- Bill credits: promo discounts paid monthly over the device term; they stop if the line is cancelled or the plan changes
- Early termination fee (ETF): charge from the old provider for leaving a contract early

# Switching (porting) a number
- The customer keeps their number when switching carriers. The new carrier needs the old carrier's account number and a number transfer PIN
- The customer gets the transfer PIN themselves from their current carrier's app or website and enters it directly with the new carrier. We do not ask for or write down PINs, passwords or one-time codes
- The old line is closed automatically when the port completes; any phone balance owed to the old carrier is still due
- Unlocked phone: can be used on another carrier. Carriers unlock phones after a set time and once the phone is paid off`,
  },
];
