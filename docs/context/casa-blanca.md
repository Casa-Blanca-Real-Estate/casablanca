# Casa Blanca — Context for Claude Code (Casanova track)

**Last assembled:** September 11, 2026, by Claude, from Kimani's Casa Blanca project memory and project knowledge.
**Purpose:** Context for the "Casanova" Claude Code track working in the `casablanca` repo — company background, current operational state, tooling conventions, ways of working, and the underlying reference docs (buyer's guide, design system, IG strategy, etc.) in full.
**Freshness warning:** The "Current State" section (§5) is a snapshot and will drift as work continues — treat it as a starting point, not ground truth, and confirm anything load-bearing with Kimani. The reference docs in §8 are more durable (brand system, company research) but were last touched on the dates noted in each section.

---

## 1. Who's doing this work

Kimani is the sole marketing, content, and tools person at Casa Blanca — a boutique NYC residential real estate brokerage — working 3 days per week. His scope: Instagram content strategy and production, browser-based internal tools for agents, automation, and web presence. He also runs other build tracks (MindBinder, his personal site) concurrently, so Casa work happens in dedicated blocks, not continuously — don't assume constant availability for review/iteration.

---

## 2. Company Snapshot

- Casa Blanca: NYC's fastest-growing residential brokerage by agent growth (362% in 2022), highest agent retention in NYC (93%+). Founded Feb 2019 by Hannah Bomze (CEO) and Erez Zarur (COO), originally as "Let's Real Estate," then a swipe-based consumer app ("dating app of real estate" / "Bumble for real estate") before pivoting to an agent-centric brokerage model.
- ~200+ agents, independent-contractor model, $5B+ in career sales collectively.
- Model: Casa Blanca generates and distributes leads to agents (via a deep StreetEasy partnership) rather than agents prospecting themselves. Zero desk fees. Full admin/back-office support (photography, staging, board packages, legal docs, marketing) so agents focus only on clients.
- Mentorship: new agents are paired with a dedicated mentor (who doesn't sell their own deals) for their first 5 transactions; the mentor is paid a cut of what the mentee transacts. This structurally locks the company into supporting new agents — it can't abandon the mission without dismantling the system that also drives recruiting.
- The "villain" in Casa's own internal positioning: legacy brokerages that charge desk fees and profit regardless of whether an agent transacts, making the industry hard to break into.
- Headquarters: 10 Hubert Street, NYC. Also a Denver, CO office (launched 2021).
- Full company research is in §8.1 (Strategic Analysis) and §8.3 (Notes) below.

---

## 3. Key People

- **Hannah Bomze** — Founder & CEO (@hannahbomze). hannah@casa-blanca.com for Calendly booking / recruitment CTA.
- **Erez Zarur** — Co-founder/COO, co-decision-maker with Hannah on strategy and web.
- **Derek** — Head of Agent Success. derek@casa-blanca.com for agent success and card-file requests.
- Key agents in recurring content work: **Tristen Marin** (@tristenmarin), **Josie Hubschman** (@josiehubschman), plus Stacy, Zeshaan, Sam Valk and others who appear regularly.
- **creative@email.casa-blanca.com** — the Casa work inbox / primary creative contact. This is separate from Kimani's personal Gmail (kjocalliste@gmail.com), which is the only inbox connected to Claude.
- **success@casa-blanca.com** — currently agent-facing; would need a new alias or confirmed routing before use as a client-facing contact address.

---

## 4. Positioning & Audience

- Agent-centric brokerage: no desk fees, StreetEasy lead partnership, mentorship, high retention.
- The "dating app of real estate" origin is historical context only — not part of current operations or messaging.
- Two audiences: prospective agent recruits, and general NYC real estate consumers (buyers/sellers/renters).
- Kimani's internal read (from the Notes, §8.3): Casa's marketing has leaned too heavily on the product/offering and not enough on the human infrastructure (mentorship, culture) that's the actual differentiator. There's internal tension between a tech-forward framing (one co-founder's preference) and a human-forward framing (Kimani's read) — he thinks tech-forward makes Casa look like every other proptech play, and human-forward is what's genuinely distinct.

---

## 5. Current State (as of early Sept 2026 — see freshness warning above)

### Web presence
- Wix Studio is the settled-on website platform. The main casa-blanca.com site is untouched for now.
- A branded Wix Studio template for individual agent sites has been built.
- An agent-facing directory (potentially agents.casa-blanca.com) was proposed as a scalable alternative to individual agent sites — decision pending with Erez/Hannah, including lead-routing implications.
- Separately, a client-facing single-page site was scoped for nyc.casa-blanca.com on Framer (full brief in §8.4) — intended to eventually merge into a Framer rebuild of the main site as a buyer/agent toggle.

### Google Business Profile
- One 1-star review from a non-client, referencing a terminated former agent; a flagging strategy and public response have been drafted.
- Agent-driven review-building plan is ready: agents personally ask past clients, no quotas/incentives, no copy-paste text.
- Instagram carousel incentive in place: reviews naming agents get formatted into carousels on the CB account.
- Agent email blast is drafted but held until the negative-review situation resolves.

### Content
- Sam Valk Agent Spotlight carousel completed (built in Photoshop).
- Zeshaan Qadir Agent Spotlight carousel — no transcript/photos/drafts yet; starts from scratch when picked up.
- Instagram post bank ran out — no current buffer, needs rebuilding.
- "Freshman Class" / new-agent-intro post — background-info email sent to five agents.

### Tools
- **CB Business Card Generator** (`CB_CardGenerator.html`) — fully audited and shipped. Pill-selector scaffold in place for a future second card design.
- **Listing Carousel Builder** (multi-listing announcements) — at v7, production-readiness is the near-term goal. Three Netlify serverless functions (`smartfill.js`, `caption.js`, `imgproxy.js`) exist but were untested live at last check.
- **CB Single Property Editorial Carousel Builder** — was in active dev (v2 delivered but broken); moved to Claude Code for faster iteration, with a comprehensive kickoff prompt written for that environment. Spec: `SINGLE_EDITORIAL_LISTING_BUILDER_Positions.pdf`.
- **CB Closed Carousel Builder** — fully built and deployed at `cb-ig-closed-carousel-builder.netlify.app`. AI features, agent photo library, StreetEasy auto-fill, session persistence, keyboard shortcuts, split caption generation.
- **CB Profile Generator** (`CB_ProfileGenerator.html`) — built and shipped, batch processing, background removal, output-naming conventions.
- **ISO Email Automation** (Make.com) — core freeform and structured paths operational; preview text, subject-line inference, and scheduling working. Deferred: resubmission/cancellation flow, dual-agent ISO support.
- Mailchimp contact import — deprioritized due to repeated import instability.

### On the horizon
- Second card design for the Business Card Generator.
- Agent directory decision (complementary to, or replacing, individual Wix agent sites).
- Finishing the CB Single Property Editorial Carousel Builder in Claude Code.
- Getting the Listing Carousel Builder production-ready with live, tested serverless functions.
- ISO automation: resubmission/cancellation flow, plus dual-agent support.

### The automation Kimani wants next: the Creative Studio pipeline
**Goal:** stop hand-aggregating listings and instead bulk-produce Casa Blanca "recently closed" carousel posts ahead of time, so the only manual step is review/edit. Estimated savings: hours per week.

**The pipeline:**
1. Read the Casa work inbox (creative@email.casa-blanca.com) for recently closed / in-contract deals.
2. Take the listing address from the email and Google it to find the StreetEasy listing URL (StreetEasy blocks direct fetch, so web search with address + unit number works better than a direct link fetch).
3. Paste that StreetEasy link into the Casa Blanca Creative Studio tool.
4. The tool's built-in Firecrawl integration fetches everything needed, including a property photo and the description.
5. Kimani reviews and edits — the fetched text often needs cleanup, and the tool sometimes fails.
6. Publishing stays manual through Instagram (no paid scheduler like Buffer).

**Constraints:**
- StreetEasy is the only place the needed listing information lives that Kimani can access — no RLS or MLS access.
- Closing emails carry only the listing address, the agent(s) on the deal, and the closing price — not enough for a post, which needs a property image and a description.
- Only Kimani's personal Gmail (kjocalliste@gmail.com) is connected to Claude, not the Casa work inbox. He doesn't want to forward work mail to his personal Gmail — it would clutter it, wouldn't backfill existing mail, and would mean relabeling everything.
- Open to routing the email side through Make (already connected). Willing to add an API surface to Creative Studio — doesn't consider that a big deal.
- **Status:** wants to pick this up in a dedicated session (likely Saturday or Monday), not squeezed into a regular working day.

---

## 6. Tooling & Platform Stack

- **Netlify** — hosting plus serverless functions.
- **Wix Studio** — agent site template.
- **Make.com** — ISO automation.
- **Mailchimp** — email distribution.
- **Google Forms** — agent ISO intake.
- **Photoshop** — carousel production. **InDesign** — grid/table layouts.
- **Anthropic API (Claude Haiku)** — in-tool AI features. **Firecrawl** — StreetEasy scraping. **@netlify/blobs** — session and agent-photo storage.

### Brand assets
- **Object Sans** is the brand font (Regular 400 + Heavy 800, embedded as base64 — never linked externally).
- CB wordmark: black PNG and white-padded PNG.
- The full design system doc — colors, typography, components, JS helpers — is reproduced in full in §8.2 below.

### Tools architecture — hard constraints, read before building
- Single-file HTML, no frameworks, no build pipeline, embedded base64 assets, deployed via Netlify drag-and-drop — or connect the GitHub repo to Netlify for auto-deploys (preferred: keeps version control clean while retaining full serverless function support).
- Tools are built for internal users (agents): zero-install, browser-based, no accounts required.
- `netlify.toml` must explicitly declare the functions directory.
- `node_modules` must ship in the zip.
- No esbuild bundler for functions that use `@netlify/blobs`.
- `imgproxy.js` genuinely requires a server (canvas taint prevention) — cannot go client-side.

### Carousel builder development
- Always fork the working reference template rather than clean-room rewrites.
- Surgical, slide-by-slide patching with validation at each step is the correct approach — not big-bang rewrites.
- Spec-PDF brackets like `[Subhead]` are field labels, not literal characters to render.

### Make.com gotchas
- Use `contains()` not `startsWith()` for formula matching.
- Pass native date objects for Mailchimp scheduling (not the `formatDate` wrapper) to stay on 15-minute intervals.
- "Set Multiple Variables" lives under Tools in the Make UI — search `builtin:SetVariables`.

### Data sourcing gotchas
- StreetEasy listing pages block direct web fetch — use web search with address plus unit number to surface key details from snippets instead.
- PDFs with custom font encoding: programmatic text extraction is unreliable; screenshot-to-text is the most effective workaround.

---

## 7. Ways of Working

- Ships v1s and converges through iteration; pragmatic about workarounds vs. full solutions.
- Prefers Claude to execute changes directly rather than walk through them manually.
- Signals session wrap clearly; leaves end-of-session notes for continuity.
- Communication style is direct, casual, stream-of-consciousness (especially by voice); converges through iteration.
- Prefers "mostly steak, not sizzle" for written output.

### Agent Spotlight carousel process
- Reads full transcripts rather than summaries.
- Flags accuracy issues before publishing.
- Maps photos to DSC filenames.
- Requests specific new shots based on content gaps.
- Prefers a mix of seamless spreads and standalone slides.

### Content principles
- Content pillars: informative, relatable, funny, or educational — ideally shareable.
- Native, non-salesy content outperforms branded/engagement-farmed approaches.
- Prominent logos make organic content read as advertising.
- Agents are very difficult to get to submit assets (even profile photos) — don't build workflows that depend on agent responsiveness.
- For Google reviews: volume and timing alone are not policy-violation signals; the real risks are review-gating systems, direct incentives to reviewers, and copy-pasted text.

### Instagram/social copy conventions
- Always use normal capitalization and punctuation.
- Do **not** default to casual lowercase style for Casa Blanca social posts — this is a house-style override that applies specifically to CB, not a general rule.

---

## 8. Full Reference Documents

The sections below reproduce the underlying source docs in full, so Claude Code doesn't need to hunt for them separately. Some predate this file and may be stale in spots (dates are noted where the source doc states one) — verify anything load-bearing before acting on it.

### 8.1 Strategic Analysis — Casa Blanca: NYC's Fastest-Growing Brokerage

# Casa Blanca: Comprehensive Reference Document on NYC's Fastest-Growing Brokerage

Casa Blanca has emerged as **New York City's fastest-growing residential real estate brokerage**, achieving **362% agent growth** in 2022 and maintaining the **highest agent retention rate (93%+)** among NYC brokerages. Founded in 2019 by Hannah Bomze and Erez Zarur, the company has evolved from its original "dating app of real estate" positioning into an agent-centric brokerage that provides comprehensive support, technology, and mentorship to a roster of **200+ agents** who have collectively generated over **$5 billion in career sales**.

The company's distinctive model—providing leads directly to agents, eliminating desk fees, and handling all administrative work—has positioned Casa Blanca as a disruptive alternative to traditional brokerages like Compass, Douglas Elliman, and Corcoran. Its deep partnership with StreetEasy, including CEO Hannah Bomze's founding membership on the StreetEasy Agent Advisory Board, provides agents with exclusive lead access and premium listing placement.

---

## Company founding and the pivot from "dating app of real estate"

Casa Blanca was founded in **February 2019** by Hannah Bomze (CEO) and Erez Zarur (COO), originally under the name "Let's Real Estate" before rebranding. The company launched its consumer-facing mobile app in **October 2020**, positioning itself as the **"Bumble for real estate"** or **"Tinder for home search"**—a swipe-based interface where users rejected or saved listings while AI/machine learning algorithms refined property recommendations based on each interaction.

The original model featured several innovative elements: an in-depth style quiz assessing lifestyle preferences (proximity to parks, cooking habits, design aesthetics) beyond standard budget and square footage criteria; a **1% buyer commission rebate** at closing; and direct-to-consumer property matching. Fortune, TechCrunch, and House Beautiful covered the launch extensively, with TechCrunch reporting in April 2021 that the company raised **$2.6 million in seed funding** led by Samuel Ben-Avraham (early investor in WeWork and Kith), bringing total funding to **$4.1 million**.

The company has since **pivoted significantly** from its consumer app origins to become primarily an agent-focused brokerage emphasizing support, mentorship, and lead generation. While the technology platform still exists, current marketing and operations center on recruiting, training, and empowering agents rather than direct consumer acquisition. This evolution reflects lessons learned about sustainable growth in the competitive NYC market.

**Key milestones:**
- February 2019: Company founded
- October 2020: Consumer app launched
- April 2021: $2.6M seed round raised; expanded to Denver, Colorado
- 2022: Named #1 fastest-growing NYC residential brokerage
- 2023: Hannah Bomze recognized as Crain's Notable Leader in Real Estate
- 2024-2025: Roster grows to 200+ agents with $5B+ career sales

---

## Hannah Bomze established an unconventional path to leadership

Hannah Bomze obtained her **real estate license at age 18**, making her one of the youngest licensed agents in New York. She studied **International Relations and Affairs at New York University (2008-2011)** before building her career alongside her mother, a veteran NYC real estate agent who served as her "first mentor."

Her pre-Casa Blanca trajectory included four years at **Douglas Elliman (2012-2016)** followed by nearly two years at **Compass (2016-2018)**, where she co-founded the "Bomze Team." These experiences shaped her critical view of traditional brokerage culture. In interviews, she has described the industry's "antiquated operating model and competitive, toxic culture" where agents "act as their own CEO—hiring assistants and drawing in leads on their own and ultimately competing with colleagues."

Bomze's frustrations extended to customer experience: "Home buyers were paying really high commissions, and looking for a new home was overwhelming because there was no streamlined place to look for or access information." A key insight driving Casa Blanca's founding was that **91% of home buying decisions are made by women**, yet "nothing had ever been built to cater to them specifically."

Her leadership philosophy emphasizes **collaboration over competition**, **flexibility for working parents** (she was pregnant with her second child while building Casa Blanca), and deliberate recruitment of people "who have been out of the traditional workforce—moms who took time off. I find they are incredible at time management, have great skill, and are incredibly relatable."

**Recognition and board positions:**
- **Crain's New York Business Notable Leaders in Real Estate (2023)**
- **Founding member, StreetEasy Agent Advisory Board** (2023 and 2024 cohorts)
- Notable deal: Sold off-market penthouse at 20 Greene Street for **$35.8 million**

---

## Leadership team brings luxury market expertise

Beyond the co-founders, Casa Blanca's leadership expanded significantly with the **February 2022 hire of Louis Buckworth as Managing Director**. Buckworth previously served as Sales Director at Zeckendorf Development's 520 Park Avenue, where he sold **$1 billion worth of units** in one of Manhattan's most prestigious new developments. He also holds experience at Brown Harris Stevens and Corcoran.

Buckworth joined as both an executive and **investor in Casa Blanca**, tasked with bringing "white glove" luxury service standards to millennial and Gen-Z residential transactions and training new agents to "translate the luxury experience." His perspective on Casa Blanca: "It has the potential to shift the perception of the real estate industry to evolve into one that is progressive, modern and… trustworthy."

**Co-founder Erez Zarur** serves as COO, overseeing operations and product development. Before Casa Blanca, he founded **Emerson Thorpe**, a fashion and lifestyle company he ran from 2010 to approximately 2019. The company currently employs **101-250 total staff** according to organizational databases, with **Jessie (Weinstein) Pritchard** heading recruitment.

---

## The business model eliminates traditional agent pain points

Casa Blanca's current model inverts the traditional brokerage relationship. Rather than agents bringing business to the company, **Casa Blanca generates and distributes leads directly to agents**, allowing them to focus entirely on client service rather than prospecting.

**Lead generation and distribution:**
The company employs a "top-down" approach fostering direct relationships with customers, primarily through its **StreetEasy partnership** providing exclusive leads. Lead allocation follows a performance-based system: "We monitor your response rates and conversions and give you as many clients as you can handle well." Agents "usually transact within their first 3 months" of joining.

**Zero out-of-pocket costs for agents:**
Casa Blanca eliminates desk fees and provides all services free of charge, including:
- Professional photography and staging
- Board package preparation
- Listing and rental agreements
- Legal document processing
- Marketing materials production
- Car services

An internal "Success Team" handles all administrative work, allowing agents to focus exclusively on client relationships. One agent testimonial captures the value: "I love that I don't have to think about things like photography and staging or paperwork. It's just easy."

**Commission structure:**
The company operates on percentage-based commission splits with no upfront costs. Marketing materials promise "crystal-clear payment structures" and "no-hassle payment at closing." However, Glassdoor reviews note the "split isn't a great one"—suggesting a tradeoff between the extensive support services and take-home commission percentage. Buyers continue to receive **up to 1% cash back** at closing.

**Geographic scope and transaction types:**
- Primary market: New York City (all boroughs, Manhattan-focused)
- Secondary market: Denver, Colorado (launched 2021)
- Transaction types: Residential sales, rentals, buyer and seller representation
- Price range: First-time buyer properties through **$15 million luxury listings**
- Sales volume: $100M+ during beta period; projected $280M in 2021; $5B+ career total

---

## Mentorship program pairs new agents with dedicated coaches

Casa Blanca's mentorship structure directly addresses what Bomze identifies as the industry's biggest barrier for newcomers: "Switching into real estate without strong connections or guidance is overwhelming."

**Program structure:**
New agents are paired with experienced mentors for their **first five transactions**. Critically, mentors are **licensed agents who do not actively sell**—they are dedicated full-time to teaching and coaching. This eliminates the conflict of interest present when working agents mentor competitors. Mentors "only see a payout when you close," creating aligned incentives for mentee success.

The mentorship covers New York's "unique sales process from start to finish," with one agent noting: "My mentor really gave me a lot of confidence on my first deals. It made the transition into real estate feel way less scary."

**Onboarding timeline:**
1. Initial call to assess fit
2. Interview process
3. License transfer (or guidance on obtaining license)
4. Comprehensive training program
5. Mentor pairing and client assignment

Total timeline from license transfer to receiving clients: approximately **two weeks**.

**Ongoing training encompasses:**
- Basics of real estate transactions
- Advanced negotiation techniques
- Market trends and legal changes
- Sales and marketing strategies
- One-on-one coaching sessions

The company explicitly targets **agents with less than two years of experience** and career changers from fashion, hospitality, media, and food service industries—demographics often underserved by traditional brokerages that favor established producers.

---

## StreetEasy partnership delivers exclusive market access

Casa Blanca's most significant strategic relationship is its **deep partnership with StreetEasy**, New York's dominant real estate search platform. This manifests through multiple channels:

**StreetEasy Experts Program:**
Casa Blanca agents participate in StreetEasy's Experts program, which connects buyers and sellers with agents demonstrating relevant experience in specific buildings, neighborhoods, or property types. Agent Josie Hubschman, who joined StreetEasy Experts in late 2021, describes it as "a partnership, a new ecosystem, and a new landscape... It requires partnership and collaboration, and also requires a lot of training and accountability."

Participation involves StreetEasy's "strict performance standards" with assigned Business Advisors providing support and accountability. The collaboration "has resulted in learnings on both sides," with StreetEasy providing analytical insights that Casa Blanca translates into "critical KPIs" for agent training.

**StreetEasy Agent Advisory Board:**
Hannah Bomze is a **founding member** of the StreetEasy Agent Advisory Board (AAB), launched June 15, 2023. This invitation-only forum brings together top NYC agents to provide feedback on partner resources, products, events, and programming. Members receive early access to StreetEasy products in development. Bomze served on both the **2023 and 2024 AAB cohorts**. Note: This is an advisory board for agent-focused products, not a corporate board of directors position.

**Benefits to Casa Blanca agents include:**
- StreetEasy Exclusive Leads: Premium leads connecting agents with serious buyers/sellers before broader market exposure
- StreetEasy Priority Listings: Enhanced placement increasing listing visibility
- Market data and analytics on pricing and listing performance
- Exclusive buyer and seller leads unavailable to competing brokerages

---

## Competitive differentiation centers on culture and support

Casa Blanca positions itself as the antithesis of traditional NYC brokerages, with specific contrasts to major competitors:

| Factor | Casa Blanca | Traditional Brokerages |
|--------|-------------|------------------------|
| Lead generation | Company provides leads | Agents source own business |
| Administrative support | Full service, free | Limited or agent-paid |
| Desk fees | None | Typically $500-$1,500+/month |
| Internal culture | Team collaboration | Competitive, agent vs. agent |
| Technology | Mobile-first matching app | Standard CRM/websites |
| Commission rebate | 1% buyer cashback | Typically none |

**Target demographics:**
- **Buyers/renters:** First-time homebuyers, millennials and Gen Z, tech-savvy consumers, women (91% of buying decisions)
- **Agent recruitment:** New agents under two years experience, career changers, working mothers, women seeking flexible schedules

Casa Blanca's **75% female staff** reflects deliberate recruitment emphasizing "great interpersonal skills" and organizational ability. The founding team's initial composition (14 of 15 staff were women) established this cultural foundation.

**Brand positioning:**
The company name translates to "white house" in Spanish but carries deliberate meaning: "a blank slate, a new start, somewhere to live their lives and create memories." Marketing emphasizes modern, approachable, anti-stuffy messaging that rejects traditional brokerage formality.

---

## Industry recognition validates the growth strategy

Third-party rankings have consistently recognized Casa Blanca's market performance:

**Corofy NYC Brokerage Rankings:**
- **#1 Fastest-Growing NYC Residential Brokerage** (2022, 2023, 2024 by agent growth percentage)
- **#1 Highest Agent Retention Rate in NYC** (2022: 93.75%; continued through 2024)
- Agent growth of **362%** in 2022
- Q2 2023: Ranked #3 in fastest-growing brokerages

**Industry rankings context:**
For comparison, Douglas Elliman maintains approximately 4,219 agents and Compass approximately 2,911 agents in NYC. Casa Blanca's 200+ agent roster represents a fraction of these established players, but its growth rate and retention metrics indicate market traction with a sustainable model.

**Notable press coverage:**
- TechCrunch (April 2021): Funding announcement and business model feature
- Fortune (October 2020): "The Bumble of real estate" launch coverage
- The Real Deal (February 2022): Louis Buckworth hire and expansion coverage
- Inman (January 2023): "Indie Brokerages Lead The Way In 2022 NYC Agent Growth"
- Wall Street Journal, Elle Decor, Domino, House Beautiful, Authority Magazine

---

## Agent reviews reveal tradeoffs in the model

**Glassdoor ratings (limited sample):**
- Overall: **4.0/5.0**
- Culture & Values: 5.0
- Diversity, Equity & Inclusion: 5.0
- Work/Life Balance: 5.0
- Senior Management: 4.0
- Compensation & Benefits: 4.0
- Career Opportunities: 4.0

**Positive feedback:** "A lot of leads through StreetEasy"; supportive environment; strong mentorship
**Critical feedback:** "Split isn't a great one"—suggesting commission percentages may be lower than competitors in exchange for comprehensive support services

**Zillow reviews (Denver office):** 5.0 rating across 11 reviews, highlighting communication and negotiation skills.

**Agent testimonials:**
- "Casa Blanca is a super supportive environment. My mentor really gave me a lot of confidence on my first deals."
- "I joined Casa Blanca because I didn't know anybody else in real estate, and needed connections. They make it ridiculously easy to focus on the fun part of selling."

---

## Technology platform bridges consumer and agent experiences

While Casa Blanca has evolved beyond its "dating app" origins, technology remains central to operations:

**Consumer-facing app features:**
- Swipe interface for property discovery
- AI-powered matchmaking refined by user behavior
- In-depth style quiz covering lifestyle preferences, design aesthetics, and neighborhood priorities
- In-app scheduling, communication, and offer submission
- Calendar integration and appointment management
- **App Store rating: 4.8 stars**

**Agent-facing tools:**
- Casa Blanca Matching App for client management
- Real-time lead assignment notifications with source, property interest, and budget visibility
- Performance tracking and earnings monitoring
- Advanced CRM systems
- StreetEasy integration for leads and listings
- Digital marketing resources

The company partners with **Varyence** for web and mobile development.

---

## Operational footprint and future trajectory

**Physical presence:**
- Headquarters: **10 Hubert Street, New York, NY 10013**
- Operating model: Mobile-first without traditional desk requirements; agents work flexibly
- Employee count: 101-250 total staff including 200+ agents

**Market coverage:**
Primary focus remains New York City with particular strength in Manhattan residential markets. The Denver, Colorado expansion (launched 2021) represents initial geographic diversification, with stated roadmap interest in Hamptons, Aspen, San Francisco, and Los Angeles markets.

**Financial position:**
- Total funding: $4.1 million
- Latest round: $2.6M seed (April 2021)
- Lead investor: Samuel Ben-Avraham
- Status: Privately held, described by leadership as "profitable and sustainable"

---

## Conclusion

Casa Blanca represents a deliberate reimagining of the real estate brokerage model, addressing agent frustrations (desk fees, lead generation burden, administrative overhead) and consumer pain points (opaque commissions, overwhelming search process) simultaneously. The company's evolution from consumer app to agent-centric brokerage reflects market learning and strategic adaptation.

Three elements differentiate Casa Blanca's position: the **StreetEasy partnership** providing exclusive lead access unavailable to competitors; the **mentorship-first culture** attracting and retaining new agents; and the **full-service support model** eliminating traditional brokerage overhead. The tradeoff—potentially lower commission splits—appears acceptable to agents who value support over independence, as evidenced by industry-leading retention rates.

Whether Casa Blanca can scale this model beyond 200+ agents while maintaining its cultural distinctiveness and support quality will determine its long-term competitive position against established players with vastly larger agent rosters. Its current trajectory suggests strong product-market fit within the new agent demographic, positioning it as a significant player in NYC's residential market evolution.

---

### 8.2 CB Tool Design System — Handoff Doc for Building Internal HTML Tools

# Casa Blanca — Agent Tool Design System
*Handoff doc for building internal HTML tools. Read this before writing a single line.*

---

## What this is

Casa Blanca builds single-file HTML tools for agents — no installs, no accounts, no backend. Agents open a file, use it, done. Every tool shares the same visual language so the suite feels cohesive. This doc covers everything needed to build a new one from scratch or extend an existing one.

The reference implementation is **CB_Tool_Starter.html** — a ready-to-build template with all fonts and the logo already embedded as base64. Start there.

---

## Assets

### Fonts — Object Sans
Two weights used. Both must be embedded as base64 `@font-face` — do not link externally.

| Weight | File | CSS `font-weight` |
|--------|------|-------------------|
| Regular | `ObjectSansRegular.otf` | 400 |
| Heavy | `ObjectSansHeavy.otf` | 800 |

```css
@font-face {
  font-family: 'ObjectSans';
  src: url('data:font/otf;base64,BASE64_HERE') format('opentype');
  font-weight: 400;
}
@font-face {
  font-family: 'ObjectSans';
  src: url('data:font/otf;base64,BASE64_HERE') format('opentype');
  font-weight: 800;
}
```

No other fonts. No system font fallbacks for branded text — use `ObjectSans, system-ui, sans-serif` only as the stack declaration.

### Logo — Casa Wordmark
File: `Casa_Wordmark.png` — black wordmark, transparent background.

Embed as base64. To render white on dark backgrounds, use CSS `filter: invert(1) brightness(2)` rather than maintaining a separate white asset.

```html
<!-- On dark (header) -->
<img src="data:image/png;base64,BASE64_HERE" style="height:24px; filter:invert(1) brightness(2);">

<!-- On light -->
<img src="data:image/png;base64,BASE64_HERE" style="height:24px;">
```

To get base64 from file in terminal:
```bash
base64 -w 0 Casa_Wordmark.png
base64 -w 0 ObjectSansRegular.otf
base64 -w 0 ObjectSansHeavy.otf
```

---

## Color Tokens

```css
:root {
  --cb-black:    #0f0f0f;  /* Primary text, header bg, primary buttons */
  --cb-white:    #cfcfcf;  /* Light surface text */
  --cb-sand:     #c0c2b5;  /* Secondary text on dark surfaces */
  --cb-lavender: #aaa3cf;  /* Accents, active states, focus rings, hover borders */
  --cb-bg:       #f4f3f0;  /* Page background */
  --cb-surface:  #ffffff;  /* Cards, panels, inputs */
  --cb-border:   #dddbd5;  /* All borders and dividers */
  --cb-mid:      #888680;  /* Labels, muted copy, placeholder text */
}
```

**Usage rules:**
- `--cb-lavender` is the only accent color. Use it for: active borders, focus states, selected thumbnails, hover effects on controls.
- Never use pure `#ffffff` for page background — always `--cb-bg` (#f4f3f0).
- `--cb-black` for primary CTAs only. Secondary actions get outlined style.
- Avoid adding new colors. Work within this palette.

---

## Typography

### Scale

```css
--text-hero:   clamp(40px, 8vw, 80px); /* Hero headlines only */
--text-label:  10px;  /* All-caps section labels */
--text-body:   13px;  /* Body copy */
--text-small:  11px;  /* Captions, notes, toasts */
--text-btn:    11px;  /* Button text */
```

### Hero Headlines
Used once per tool, at the top, before the main interaction area.

```css
.hero-headline {
  font-weight: 800;
  font-size: var(--text-hero);
  line-height: 0.92;           /* Tight — this is intentional */
  letter-spacing: -0.05em;     /* Negative tracking — always */
  text-transform: uppercase;
  color: var(--cb-black);
}
```

Format: Short, punchy, action-oriented. Line breaks are intentional. Examples:
- `UPLOAD A PHOTO, / GET IT WATERMARKED.`
- `PASTE YOUR LISTING. / GET YOUR COPY.`

### Section Labels
Uppercase, tracked out, muted. Used above every control group.

```css
.section-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--cb-mid);
}
```

### Body / Notes
13px regular for instructional copy. 11px for footnotes, privacy notes, hints.

---

## Layout

```css
:root {
  --gap-page:   48px 24px 80px; /* Main container padding (top right bottom) */
  --gap-stack:  24px;            /* Gap between major sections */
  --gap-inner:  14px;            /* Gap inside cards and panels */
  --radius:     6px;             /* Cards, drop zones, panels */
  --radius-sm:  4px;             /* Buttons, inputs, small elements */
}

main {
  width: 100%;
  max-width: 700px;          /* All tools are single-column, max 700px */
  padding: var(--gap-page);
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}
```

Single column. Centered. No sidebars. Max 700px. Tools aren't dashboards — they're focused single-task interfaces.

---

## Components

### Header
Always present. Always black. Logo left, tool name right.

```html
<header style="
  width:100%; padding:20px 40px;
  display:flex; align-items:center; justify-content:space-between;
  background:#0f0f0f;
">
  <img style="height:24px; filter:invert(1) brightness(2);"
       src="data:image/png;base64,LOGO_BASE64" alt="Casa Blanca">
  <span style="
    font-size:10px; font-weight:800;
    letter-spacing:0.2em; text-transform:uppercase;
    color:#c0c2b5; font-family:ObjectSans,sans-serif;
  ">[Tool Name]</span>
</header>
```

---

### Drop Zone
For any file upload interaction.

```html
<div class="drop-zone" id="drop-zone">
  <input type="file" accept="image/*" multiple>
  <span class="drop-label">Drop photos here or click to upload</span>
  <span class="drop-hint">JPG · PNG · WEBP</span>
</div>
```

```css
.drop-zone {
  width: 100%;
  border: 1.5px dashed var(--cb-border);
  border-radius: var(--radius);
  padding: 52px 24px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  cursor: pointer; position: relative;
  background: var(--cb-surface);
  transition: border-color 0.2s, background 0.2s;
}
.drop-zone:hover, .drop-zone.drag-over {
  border-color: var(--cb-lavender);
  background: #faf9fd;
}
.drop-zone input[type="file"] {
  position: absolute; inset: 0; opacity: 0; cursor: pointer;
  width: 100%; height: 100%;
}
```

**State pattern — compact after first upload:**
After files are loaded, collapse to a single-line compact bar. Change label to `"+ Add more photos"`. Show a "Start Over" button beside it. On reset, restore full drop zone and original label text.

---

### Buttons

**Primary (black fill) — main CTA, one per tool:**
```css
.btn-primary {
  width: 100%; padding: 15px;
  font-family: 'ObjectSans', sans-serif;
  font-size: 11px; font-weight: 800;
  letter-spacing: 0.2em; text-transform: uppercase;
  background: var(--cb-black); color: #fff;
  border: none; border-radius: var(--radius-sm);
  cursor: pointer;
}
.btn-primary:hover { background: #2a2a2a; }
```

**Secondary (outlined) — auxiliary actions:**
```css
.btn-secondary {
  padding: 9px 18px;
  font-family: 'ObjectSans', sans-serif;
  font-size: 11px; font-weight: 800;
  letter-spacing: 0.12em; text-transform: uppercase;
  background: transparent; color: var(--cb-mid);
  border: 1.5px solid var(--cb-border);
  border-radius: var(--radius-sm); cursor: pointer;
}
.btn-secondary:hover { border-color: var(--cb-lavender); color: var(--cb-black); }
```

**Preset toggles (S/M/L style):**
```css
.preset-btn { /* base styles */ }
.preset-btn.active {
  border-color: var(--cb-black);
  background: var(--cb-black);
  color: #fff;
}
```

---

### Settings Bar
A single row of pipe-divided control segments. Used when there are 2–4 related settings that belong together visually.

```html
<div class="settings-bar">
  <div class="bar-segment">
    <span class="section-label">Size</span>
    <div class="preset-group">
      <button class="preset-btn active">S</button>
      <button class="preset-btn">M</button>
      <button class="preset-btn">L</button>
    </div>
  </div>
  <div class="bar-segment">
    <span class="section-label">Position</span>
    <select>...</select>
  </div>
</div>
```

```css
.settings-bar {
  width: 100%; background: var(--cb-surface);
  border: 1px solid var(--cb-border); border-radius: var(--radius);
  display: flex; align-items: stretch; overflow: hidden;
}
.bar-segment {
  flex: 1; display: flex; flex-direction: column;
  padding: 14px 16px; gap: 10px;
}
.bar-segment + .bar-segment { border-left: 1px solid var(--cb-border); }
```

---

### Inputs & Selects

```css
select, input[type="text"], input[type="email"] {
  width: 100%; appearance: none;
  background: var(--cb-bg);
  border: 1.5px solid var(--cb-border); border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-family: 'ObjectSans', sans-serif;
  font-size: 13px; font-weight: 800;
  color: var(--cb-black);
  transition: border-color 0.2s;
}
select:focus, input:focus { outline: none; border-color: var(--cb-lavender); }
```

Custom chevron for selects:
```css
select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888680' stroke-width='1.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center;
  padding-right: 28px;
}
```

---

### Card / Panel
For grouped content, previews, info sections.

```css
.card {
  width: 100%;
  background: var(--cb-surface);
  border: 1px solid var(--cb-border);
  border-radius: var(--radius);
  padding: 24px;
}
```

---

### Color Swatches (Radio)
For color picker controls (e.g. watermark color).

```html
<div class="color-options">
  <label class="color-opt">
    <input type="radio" name="color" value="white" checked>
    <span class="swatch" style="background:#fff; box-shadow:inset 0 0 0 1px var(--cb-border);"></span>
    White
  </label>
  <label class="color-opt">
    <input type="radio" name="color" value="black">
    <span class="swatch" style="background:#0f0f0f;"></span>
    Black
  </label>
</div>
```

```css
.color-opt input { display: none; }
.swatch {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid var(--cb-border);
  transition: border-color 0.15s, transform 0.15s;
}
.color-opt input:checked + .swatch {
  border-color: var(--cb-lavender); transform: scale(1.2);
}
```

---

### Photo Gallery Thumbnails
For multi-upload tools where users preview/select from a batch.

```css
/* 3-column grid */
.gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }

/* Thumbnail */
.thumb { aspect-ratio: 1; border-radius: 4px; cursor: pointer; overflow: hidden; position: relative; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }

/* Active: lavender border, full opacity */
.thumb.active { outline: 3.5px solid var(--cb-lavender); }

/* Inactive: dimmed */
.thumb:not(.active) { opacity: 0.45; }
.thumb:not(.active):hover { opacity: 0.75; }
```

---

### Toast Notification
Appears after any completed action (download, copy, save, etc.).

```html
<div class="toast" id="toast"></div>
```

```css
.toast {
  position: fixed; bottom: 32px; left: 50%;
  transform: translateX(-50%) translateY(16px);
  background: var(--cb-black); color: #fff;
  font-family: 'ObjectSans', sans-serif;
  font-size: 11px; font-weight: 800;
  letter-spacing: 0.15em; text-transform: uppercase;
  padding: 12px 24px; border-radius: var(--radius-sm);
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s, transform 0.2s;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
```

```js
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// Usage
showToast('✓ Downloaded');
showToast('✓ 4 photos downloaded');
```

---

### Divider & Footer Note

```html
<div style="width:100%; height:1px; background:var(--cb-border);"></div>
<p style="font-size:11px; color:var(--cb-mid); text-align:center; line-height:1.8;">
  Files never leave your device. Nothing is uploaded.
</p>
```

---

## JS Helpers (reuse across tools)

### Drag & Drop Init
```js
function initDropZone(el, onFiles) {
  el.addEventListener('dragover',  e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', ()  => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) onFiles(files);
  });
  el.querySelector('input[type="file"]').addEventListener('change', function() {
    if (this.files.length) onFiles(Array.from(this.files));
  });
}
```

### Preset Button Toggle
```js
function initPresets(group, onChange) {
  group.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (onChange) onChange(btn);
    });
  });
}
```

### Canvas Watermark (logo tinting)
```js
// Tint a logo image to any color using Canvas source-in compositing
function tintLogo(logoImg, color, size, callback) {
  const canvas = document.createElement('canvas');
  canvas.width  = logoImg.naturalWidth  * (size / logoImg.naturalHeight);
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(logoImg, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  callback(canvas);
}
```

---

## UX Conventions

| Pattern | Rule |
|---------|------|
| **Privacy note** | Always include "Files never leave your device." for any upload tool |
| **Zero config** | Tools should work immediately on open — no login, no setup, no keys |
| **Single file** | Everything (fonts, logo, JS, CSS) lives in one `.html` file |
| **Download format** | JPEG at 95% quality. Filename: `originalname_cb.jpg` |
| **Compact drop zone** | After first upload, collapse to single-line bar, label becomes `"+ Add more photos"` |
| **Start Over** | Solid black button, same height as compact drop zone, beside it. Resets all state. |
| **Active state color** | `--cb-lavender` (#aaa3cf) for borders, outlines, focus — never blue |
| **Button text** | All caps, 0.2em letter-spacing, ObjectSans Heavy |
| **Transitions** | 0.15–0.2s ease on all interactive elements. No bounce, no spring. |
| **Max width** | 700px centered. No widescreen layouts. |

---

## Existing Tools

| Tool | File | Description |
|------|------|-------------|
| Image Watermarker | `cb-watermarker.html` | Batch watermarks photos with the CB logo. Color, size, position controls. Multi-upload gallery. |
| Starter Template | `CB_Tool_Starter.html` | Blank tool with all tokens, components, and helpers pre-wired. Start here. |

---

## On-Deck Tool Ideas

- **Caption Generator** — paste listing details, get IG caption options via Claude API
- **Email Sig Generator** — fill out a form, download a formatted HTML email signature
- **ISO Blast Previewer** — preview how an ISO email will render before sending
- **Show Sheet Builder** — fill in property fields, download a formatted PDF show sheet
- **Listing Description Writer** — AI-assisted via Claude API, styled to CB voice

---

## How to start a new tool

1. Open `CB_Tool_Starter.html`
2. Replace `[Tool Name]` in the header tag
3. Write a hero headline (all caps, punchy, 2 lines max)
4. Drop in only the components you need from this doc
5. Wire up the JS logic
6. Add the footer privacy note if any files are involved
7. Test: does it work offline with the file double-clicked? That's the bar.

---

*Last updated: March 2026. Maintained by Kimani @ Casa Blanca.*

---

### 8.3 Strategic Notes (from Kimani's brainstorm session)

# Casa Blanca — Strategic Notes (from KJ brainstorm session)

---

## The Mission / North Star
Casa Blanca exists to empower people to break into real estate and actually make money doing it — with real training, real tech support, and no bullshit fees eating their income before they've even started.

The business only makes money when agents make money. That's not just a value statement — it's structurally enforced by the business model.

---

## The Villain / Antagonist
The enemy is the legacy agency model: companies that treat agent licenses like gym memberships. They collect monthly desk fees from agents, provide little to no support, and profit whether agents transact or not. They make the industry hard to break into, and they have no real incentive to change that.

Casa's agents frequently come from these agencies. Most don't go back. The ones who try to leave and return usually can't — and the internal read is that it rarely works out when they do.

The villain isn't loud or dramatic — it's passive and structural. That makes it worth naming clearly in positioning and marketing.

---

## The Mentorship Model (The Linchpin)
- New agents are paired with mentors for their first five transactions
- Mentors are paid a percentage of what agents transact — not a flat fee, not a salary
- Mentors don't do their own transactions; their entire role is supporting new agents through early deals
- Once an agent hits five transactions, the mentorship relationship ends and they operate independently

**Why this matters strategically:** The mentorship model structurally locks the company into its mission. To stop prioritizing new agents, Casa would have to dismantle the entire mentor system — which would also undermine the company's ability to recruit. The infrastructure enforces the values. That's rare and worth highlighting.

This is one of four pillars marketed to prospective agents, but it may be the most important one — especially for new agents weighing their options.

---

## Scale and Efficiency (Proof Point)
- ~5–6 full-time employees (including 2 founders), all remote except founders
- Supports ~200 agents currently
- Estimated capacity to scale to ~400 agents without adding headcount
- All contractors (web, app, social/media) are growth-focused, not mission-critical ops

This ratio — roughly 1 employee per 33–40 agents — is a strong proof point for operational efficiency and a genuinely lean, scalable model.

---

## Brand Direction Tension (Internal)
There's a tension between two directions for the brand:
- **Tech-forward / legacy-tech positioning** (one co-founder's preference) — frames Casa as a modern tech company in a legacy industry
- **Human-forward positioning** (KJ's read) — emphasizes the human infrastructure: the mentorship, the support model, the culture of actually helping agents succeed

KJ's view: the tech-forward framing misses what actually differentiates Casa. The tech is a feature. The human model is the product. Leading with tech makes Casa look like every other proptech play. Leading with the human model makes it genuinely distinct.

The marketing challenge: the content strategy has leaned too heavily on the product (the offering) and not enough on the culture (why agents choose Casa and stay). The agents who leave and want to come back are the proof of concept for that story.

---

## Positioning as a Case Study
Casa is a strong example of a business that has:
- A clear villain (extractive legacy agencies)
- A mission structurally baked into the business model
- An infrastructure that enforces its values (mentorship model)
- Proof of retention (agents who leave and try to return)
- A gap between what it actually is and how it currently presents itself

This makes Casa a usable case study for KJ's consulting positioning — specifically the idea that the most important work is closing the gap between what a company has built and how it's communicating it to the world.

---

### 8.4 Client-Facing Site Build Brief (Framer)

# Casa Blanca Client-Facing Site — Framer Build Brief

## Context
Casa Blanca is an NYC residential real estate brokerage. This is a **client-facing** single-page site (buyers and sellers) — not agent recruitment. It will live at **nyc.casa-blanca.com** as a Framer subdomain, temporarily, with the intent to eventually fold it into the main casa-blanca.com Framer rebuild as a toggle experience. Design should be forward-looking — it's establishing the new visual direction that both the agent and client sites will share.

**Visual language:** Black, off-white, lavender accent (`#D2C9FF`), Object Sans typeface, CB wordmark. Serious, modern, NYC premium — not corporate, not flashy. Room to evolve from the current live site.

---

## Page Structure (single scrolling page)

### 1. Hero
Full-bleed photo background (CB to supply). Headline should be bold and buyer/seller-facing:

> **"Your New York Home Starts Here."**

Sub: "Casa Blanca agents guide buyers and sellers through one of the world's most competitive real estate markets — with expertise, technology, and care at every step."

CTA: "Book a Consultation" → Calendly link

---

### 2. Who We Are
Short brand statement. Pull from buyer's guide:

> "When you work with Casa Blanca, you're working with an expert team. We've built intelligent technology, accountability at every turn, and a roster of diligent agents — all working with one unified goal: to provide you with a real estate experience surpassing all others."

Supporting line from Hannah Bomze (founder quote):
> "Buying or selling a home is a big deal, and we treat it as such. We celebrate every moment of the journey."
> — Hannah Bomze, Founder & CEO

---

### 3. The Casa Blanca Difference (3-column cards)

- **Customer Care** — Your agent listens first. No sales pitches, no pressure. They get to know your needs, hopes, and timeline before anything else.
- **Expert Guidance** — From pre-approval to closing, your agent manages every detail: market data, negotiations, paperwork, board packages, and more.
- **Beyond the Sale** — CB's commitment doesn't end at closing. Vetted movers, renovation referrals, insurance, tech installs, neighborhood recommendations — they stay in your corner.

---

### 4. Press Strip
Logos from the live site (Fortune, Architectural Digest, TechCrunch, etc.) with the AD pull quote:

> "Casa Blanca aims to provide the next generation of buyers and renters with a seriously legitimate digital-first solution."
> — Architectural Digest

---

### 5. How It Works — Buyer Track (numbered steps)

1. **Meet your agent** — Matched to you based on your search preferences, communication style, and target neighborhoods.
2. **Get pre-approved** — We connect you with vetted mortgage brokers to establish your range before the search begins.
3. **Start your search** — Curated showings built around your schedule. Your agent recommends properties that fit your criteria.
4. **Make your offer** — Your agent handles negotiations, presents your offer, and advocates for the best possible terms.
5. **Due diligence & contract** — Your attorney reviews the contract. Our team manages the board package if required.
6. **Close & move in** — Keys in hand. And we're still here for whatever comes next.

---

### 6. NYC Property Types Explainer
A clean comparison of **Co-op, Condo, Townhouse** — pulled from the buyer's guide. Good trust signal, shows NYC-specific expertise. Suggested layout: 3-column cards or a styled table.

| | Co-op | Condo | Townhouse |
|---|---|---|---|
| **Ownership** | Indirect — stock certificate & lease | Direct — real property | Direct — real property |
| **Relative Cost** | Typically less expensive per sq ft | Typically more expensive per sq ft | Variable, usually higher end |
| **Approval** | Board interview, strict requirements | No interview, lighter application | No interview or application |
| **Financing** | At least 20% down + closing costs | At least 10% down + closing costs | At least 10% down + closing costs |
| **Monthly Fees** | Maintenance (includes taxes) | Common charges + taxes separately | Maintenance + property taxes |
| **Subletting** | Must be board-approved | Typically authorized | Authorized |

Stat callout:
> Co-ops represent **75%** of NYC housing stock. Condos **23%**. Townhouses **2%**.

---

### 7. Active Listings (CMS-powered)
A handful of CB's current listings. Kimani to set up Framer CMS collection.

- Card design: photo-forward, minimal text — address, price, property type, bed/bath
- Links to individual listing detail pages (CMS template)
- Section headline: **"Currently Available"**

---

### 8. Testimonials
Client quotes — Kimani to supply. Placeholder section for now.

- 2–3 cards, name + quote format
- Lavender accent as a visual detail

---

### 9. By the Numbers
Client-relevant stats (distinct from agent-facing numbers):

- **93% agent retention rate** — NYC's highest
- **200+ agents** across New York City
- **60 days** average time from first meeting to contract
- **$1B+ in properties transacted** *(needs verification with leadership before publishing — use placeholder if unconfirmed)*

---

### 10. CTA / Contact Footer
Two CTAs side by side:
- **"Book a Consultation"** → Calendly (hannah@casa-blanca.com, 30 min)
- **"Send Us a Message"** → Contact form routing to success@casa-blanca.com

Form fields: Name, Email, Phone (optional), Buying or Selling (toggle/select), Message.

> ⚠️ **Note:** success@casa-blanca.com is currently agent-facing. Either create a separate client alias or confirm routing with Hannah/Erez before launch.

**Footer:** CB wordmark, @casablancaliving, casa-blanca.com, 10 Hubert St New York City NY 10013

---

## Standout Content from the Buyer's Guide — Prioritize These

A few things that are genuinely differentiated and should surface prominently on the page:

- **Board package specialists** — CB has a dedicated internal team that handles the co-op board package process end-to-end. This is a real differentiator; most brokerages leave buyers to figure it out themselves. Deserves a callout, not just a bullet.
- **"Beyond the Sale"** — movers, renovation referrals, insurance, local recs, art handling, tech installs. Reads like a concierge service. Position it that way.
- **Agent matching** — buyers are matched to agents by search preferences, communication style, and target neighborhoods. Not just whoever's available. Worth surfacing.
- **The Architectural Digest quote** — "seriously legitimate digital-first solution" is strong third-party validation. Use it prominently.

---

## What Needs to Be Gathered Before / During Build

- [ ] Client testimonial quotes (Kimani has some — pull and format)
- [ ] Confirm sales volume stat ($1B+ or otherwise — do not publish unverified)
- [ ] Confirm email routing for client contact form (new alias vs. existing inbox)
- [ ] Active listing photos + details for CMS
- [ ] Subdomain approval: nyc.casa-blanca.com (or alternate — pending leadership sign-off)
- [ ] Photography assets (Kimani has these)
- [ ] Calendly link for client-facing booking (confirm it's the right one)

---

## Technical Notes

- **Platform:** Framer
- **Subdomain:** nyc.casa-blanca.com (temporary — will eventually merge into main casa-blanca.com Framer rebuild)
- **CMS:** Framer native CMS for listings (and potentially testimonials)
- **Font:** Object Sans (already in use on current site)
- **Accent color:** `#D2C9FF` (lavender)
- **Long-term plan:** Client and agent sites share the same Framer project, toggling between audiences — so build with that future architecture in mind. Keep components clean and reusable.

---

### 8.5 Instagram Insights API Setup

# Instagram Insights API Setup — @casablancaliving

Reference guide for pulling Instagram analytics (reach, impressions, follower growth, per-post/Reel engagement, audience demographics) directly via Meta's Graph API, so Claude can query it on demand instead of manual exports.

## Prerequisites
- @casablancaliving must be a **Professional account** (Business or Creator), not Personal. Check/convert in the Instagram app: Settings → Account type and tools.
- A Meta (Facebook) developer account for whoever manages this (can be Kimani's personal FB, doesn't need to be a company account).

## Step 1 — Create a Meta Developer App
1. Go to https://developers.facebook.com/ → log in → **My Apps → Create App**.
2. Choose app type **Business**.
3. Name it something like "Casa Blanca IG Analytics".
4. In the app dashboard, add the **Instagram Graph API** product (via "Facebook Login for Business" if the IG account is linked to a Facebook Page — most common route for an established business account).

## Step 2 — Link the Instagram account
- If using the Facebook Login for Business route: the @casablancaliving IG account needs to be linked to a Facebook Page. Do this in Meta Business Suite → Settings → Linked accounts (or via the Instagram app: Settings → Linked accounts → Facebook).
- Alternative: "Business Login for Instagram" skips the Facebook Page requirement entirely and logs in directly with IG credentials — simpler if there's no FB Page to link.

## Step 3 — Add yourself as an Instagram Tester (avoids App Review)
1. In the app dashboard: **App roles → Roles → Instagram Testers** → add the @casablancaliving account.
2. Accept the tester invite from within the Instagram app (Settings → Apps and websites → Tester invites).
3. This unlocks **Standard Access** for your own account — no Meta App Review needed since you're only pulling data for an account you own/manage.

## Step 4 — Generate an access token
1. Go to **Graph API Explorer**: https://developers.facebook.com/tools/explorer
2. Select the app you created.
3. Request these permissions: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`.
4. Generate a **User Access Token** (short-lived, ~1 hour).
5. Exchange it for a **long-lived token** (60 days):
   ```
   GET /oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={app-id}
     &client_secret={app-secret}
     &fb_exchange_token={short-lived-token}
   ```
6. Long-lived tokens can be refreshed before they expire — worth a calendar reminder every ~50 days, or automate the refresh.

## Step 5 — Get the Instagram Business Account ID
```
GET /me/accounts                                    → get the Facebook Page ID
GET /{page-id}?fields=instagram_business_account     → get the IG Business Account ID
```

## Step 6 — Pull analytics
Once you have the IG Business Account ID + long-lived token:
```
GET /{ig-account-id}/insights?metric=impressions,reach,profile_views,follower_count&period=day
GET /{media-id}/insights?metric=impressions,reach,engagement,saved,video_views
```

## Using this with Claude
Once the long-lived token + account ID exist, share them in a Claude session (ideally as environment variables, not pasted in plain chat long-term) and Claude can pull metrics directly via curl/HTTP requests and turn them into reports, trend charts, or feed the growth-tracking workflows already in the Casa Blanca IG notes.

## Security notes
- Treat the access token like a password — anyone with it can read (and depending on scope, manage) the account's data.
- Long-lived tokens expire in 60 days; set a refresh reminder.
- Standard Access only covers accounts you/your team manage directly — fine for this use case, no business verification or App Review needed.

---

### 8.6 CB Buyer's Guide (agent-facing PDF, extracted text — 18 pages)

*Extracted from CB_Buyers_Guide_012026_v1_3.pdf. Page breaks marked below. Layout/design (photos, callout boxes) is lost in extraction — this is text content only.*

--- Page 1 ---
casa-blanca.com | success@casa-blanca.com | @casablancaliving
Home Starts Here
buyerʼs guide
1BUYER’S GUIDE
--- Page 2 ---
Mortgage Application Best Practices
Purchasing Timeline
Understanding & Calculating Debt-to-Income Ratio
Due Diligence
Our Walk-Through Checklist
Board Interview Preparation
Real Estate Glossary
Table of 
Contents
“Casa Blanca...aims to provide 
the next generation of buyers and 
renters with a seriously 
legitimate digital-first solution.ˮ
— Architectural Digest
2
...................................03
........................................04
................................................05
...........................................................06
....................................08
.......................................09
.............................................................10
The Keys to NYC Real Estate
Why work with an agent?
Where to Call Home
Step by Step
The Casa Blanca Difference
What Home Means to You
Offer Types
..……................11
................................................12
..13
..........................................................14
....................................15
....................................16
................................................17
CASA BLANCA BUYER’S GUIDE
--- Page 3 ---
The Keys to 
NYC Real Estate
The real estate market in New York City is notoriously 
complicated and competitive. Weʼve seen it all, and we 
want to arm you with the knowledge and confidence 
you need to navigate the choices ahead. Thatʼs why 
our agents are specialists in New York City real estate, 
prepared to guide you home with grace and skill.
When you work with Casa Blanca, youʼre working with 
an expert team. Weʼve built intelligent technology, 
accountability at every turn, and a roster of diligent 
agents, all working in unison with one unified goal: to 
provide you with a real estate experience surpassing 
all others.
CASA BLANCA
3
BUYER’S GUIDE
--- Page 4 ---
CASA BLANCA
Why work with 
an agent?
Weʼre here to help.
Buying a home should be a joyful milestone that comes from 
a rewarding journey. Itʼs also a complex process comprised 
of many steps. Our agents are with you every step of the 
way to illuminate the process, provide up-to-the-minute 
market data, manage the particulars, calculate costs, and 
negotiate on your behalf.
Access to our trusted network.
Your Casa Blanca agent can make expert referrals on both a 
neighborhood and city-wide level. Curious about the best 
contractor, pet daycare nearby, the most professional 
moving company, or the ideal attorney for you? Your agent 
can point you in the right direction.
Working with a licensed agent provides many 
distinct advantages, and working with a Casa 
Blanca agent means you can be sure that 
every detail will be taken care of.
4
BUYER’S GUIDE
--- Page 5 ---
CASA BLANCA
A co-op (housing cooperative) is a multi-unit building owned by a corporation. The 
corporation sells shares to a new buyer when they make a purchase. A co-op 
owner receives a proprietary lease (also called an occupancy agreement) as title 
and does not directly own their residence.
A condominium is a multi-unit building wherein the owner of a unit owns the unit 
outright. A condo owner is entitled to use building amenities but cannot claim 
ownership over common spaces.
Both co-ops and condos have governing boards responsible for creating and 
enforcing building bylaws.
A townhouse is a multi-level home that may share a wall with an adjacent property 
and usually offers outdoor space. New York City townhouses vary widely in building 
material and architectural style. Owning a townhouse can provide autonomy and 
privacy - there is no board, and neighbors do not share the dwelling.
Where to 
Call Home
CO-OP CONDO TOWNHOUSE
OWNERSHIP TYPE
Indirect; stock certificate 
and lease Direct; real property Direct; real property
RELATIVE COST
Typically less expensive
per square foot
Typically more expensive
per square foot
Variable, but typically 
priced on the higher end
APPROVAL 
PROCESS
Board interview and 
strict requirements 
imposed
No interview process, 
the application is not 
as thorough
No interview or 
application, faster and 
more straightforward 
process
FINANCING
Expect at least 20% 
of the purchase price
down, plus closing costs
Expect at least 10% 
of the purchase price
down, plus closing costs
Expect at least 10% of the 
purchase price down, plus 
closing costs, depending on 
the loan-to-value ratio 
determined by your bank
MONTHLY FEES
Maintenance fees, 
including taxes.
The number of shares 
determines the cost
Common charges, 
covering building 
services and amenities.
Taxes paid separately
Maintenance costs and
property taxes
SUBLETTING / 
INVESTMENT USE
Must be approved by the 
co-op board Typically authorized Authorized
SELLING
The buyer must receive 
board approval. Seller 
pays flip tax Sold at will Sold at will
TAX BENEFITS
Some tax deductions 
can be taken for 
owner’s share
Abatement programs 
make taxes 
advantageous for 
about ten years
Non-applicable
Co-ops represent the largest share of NYC housing stock at 75%. 
Condos account for 23%, with townhouses making up about 2%.
There are three primary property types available to 
homeowners in NYC: co-ops, condos, and townhouses. 
Understanding the respective nuances of these options 
will help you determine which suits you best.
5
BUYER’S GUIDE
--- Page 6 ---
02 Pre-approval support
The most crucial step before you begin your 
search is connecting with a mortgage 
broker. If you donʼt already have one, your 
agent will provide a vetted recommendation 
for you.
Based on your employment status, income, 
and credit, the mortgage broker will 
determine how much a bank will lend you, 
and issue either a pre-qualification or 
pre-approval letter. A pre-qualification is an 
opinion letter, whereas a pre-approval is a 
loan authorization for a specific amount.
You can read more about applying for a loan 
on page 11.
Your approved amount will help us set a 
price range to guide your search. Your 
mortgage broker will give you an overview of 
offer types.
Learn more about offer types on page 10.
If youʼre making an all-cash offer, this step 
will not apply.
04 Make an offer
Youʼve found your perfect home! Your agent 
will guide you in determining a suitable offer 
amount and sale conditions. Your agent will 
then formally present your offer to the 
sellerʼs representation. Your agent can also 
generate a market analysis CMA) report to 
help you understand a homeʼs market value 
before deciding upon an offer amount.
Itʼs prudent at this point to retain an attorney 
(preferably one with deep knowledge and 
experience in NYC residential real estate 
transactions). Your agent can provide you 
with vetted options. Youʼll include your 
attorneyʼs contact information with your 
offer.
An accepted offer creates a non-binding 
agreement for the purchase of the home. 
The non-binding nature of an offer means 
you can present bids for multiple properties 
if you are inclined. In most cases, the seller 
will return with a counteroffer, which you can 
accept, reject, or counter.
Your agent will represent you in all 
negotiations, ensuring you receive the best 
possible price and terms.
You can learn more about the paperwork 
included in an official offer on page 10.
6
CASA BLANCA
01 Meet your team
Your dedicated agent is matched to you 
based on factors such as your search 
preferences, favored communication style, 
and desired neighborhoods.
Youʼll also enjoy access to the Casa Blanca 
Success team, our administrative wing 
providing support for everything from 
building applications to financial forms to 
contract paperwork.
03 Your showing plan
Time to start your search! Use the questions 
posed on page 9 to organize your thoughts 
and form a clear, comprehensive vision of 
your future home. Your agent will 
recommend properties that fit your criteria 
and our team will build a showing schedule 
around you.
Hereʼs how the typical buying 
process goes… Step By Step
BUYER’S GUIDE
--- Page 7 ---
08 Board approval management
Board application and approval are 
necessary for purchase in both condo and 
co-op buildings.
In most cases, condo boards are relatively 
lenient and no interview is required. Co-ops, 
however, typically employ a nuanced, 
intensive process with a great deal of 
paperwork and at least one interview 
required. The tangible result of the co-op 
application process is a lengthy, detailed set 
of documents known as a board package.
As a Casa Blanca client, youʼll receive full 
access to our dedicated team of board 
package specialists who will guide you 
through the compilation of necessary 
paperwork, including bank statements, tax 
returns, and letters of reference. They will 
polish your board package to perfection, 
making the most robust case possible for 
your acceptance as a new owner.
Board interviews usually take place with-in 
the building, with either select board 
members or the entirety of the board in 
attendance. Review best practices before 
your interview on page 16.
A decision will likely come a few days after 
your interview, and weʼll be ready to move 
forward with final details as soon as youʼre 
approved!
If youʼre purchasing a townhouse, this step 
does not apply, and you may proceed to the 
next step.
CASA BLANCA
06 Deposit and signing
After signing the contract, your deposit 
(usually 10% of the purchase price) is kept 
secure in an escrow account until closing. A 
third party temporarily holds the deposit until 
the terms of the purchase agreement are 
fulfilled.
09 Closing scheduled
Once the bank has provided clearance, your 
attorney and the sellerʼs attorney will confirm 
a closing date.
10 Final walk-through
This walk-through provides an opportunity 
for you and your agent to assess the 
propertyʼs condition. Ideally, this will take 
place within a few days of the closing. 
During the walk-through, youʼll take note of 
any outstanding improvements or fixes 
needed.
Our agents are deeply familiar with our 
thorough standards of acceptable property 
conditions and will advocate on your behalf 
to make sure every base is covered.
You can read our complete walk-through 
checklist on page 15.
11 Closing
Congratulations! You are now a 
homeowner. Youʼll receive your keys and 
start your move-in process.
7
05 Due diligence
Your attorney will review the contract of sale, 
as well as the house rules and financial 
standing of the building.
Itʼs in your best interest to work with 
someone deeply experienced in New York 
City residential real estate transactions. Your 
agent can make introductions to several 
expert attorneys for your consideration.
After a thorough evaluation, your attorney 
will advise you when itʼs time to sign the 
contract officially!
You can learn more about the due diligence 
process on page 14.
07 Loan application
Your lending institution may ask to see 
additional documents before finalizing your 
loan. Your agent can assist you in compiling 
and presenting these materials.
A third-party appraisal ordered by the lender 
will verify the value of the property.
You can read more about best practices for 
loan applications on page 11.
12 Post-Closing
Before you start stressing over to-do lists, 
take a deep breath! Your Casa Blanca agent 
is on hand to help with anything from 
recommending expert movers to the best 
neighborhood coffee shop. And when youʼre 
ready to make your next move, weʼll be right 
here to support you.
CASA BLANCA BUYER’S GUIDE
--- Page 8 ---
CASA BLANCA
The Casa Blanca 
Difference
Buying a home should be a joyful life event. 
Casa Blanca is on a mission to make it just that. 
Our thought- ful, experienced, customer-centric 
agents deliver the highest quality service in the 
industry, and thatʼs just the tip of the iceberg.
Customer care.
Your agent will get to know you during an initial conversation, void of 
sales pitches or pressure to schedule tours. Instead, theyʼll listen 
carefully and attentively to you as you discuss your needs, hopes, 
and dreams for your new home.
Your agent will check in with you throughout your search to make 
sure youʼre happy with the journey. Theyʼll ensure youʼre on track for 
success and support you as you find your dream home.
Beyond the sale.
Casa Blancaʼs commitment to you doesnʼt stop at closing. Weʼve 
assembled a suite of services that make it easy to love living in your 
new home! Our team can assist with organizing vetted movers, 
renovation and interior design, art handling, homeownerʼs insurance, 
tech installs, and more. Weʼre even prepared to recommend local 
favorites–from charming coffee shops to buttoned-up dry cleaners.
8
CASA BLANCA BUYER’S GUIDE
--- Page 9 ---
CASA BLANCA
Where would you like to live? Which boroughs and neighborhoods 
do you love? Are there specific landmarks youʼd like to either be 
close to or avoid, such as parks, museums, or transportation 
centers?
What kind of property do you want? Are you interested in a condo, 
co-op, or townhouse? Do you love pre-war buildings? Maybe youʼre 
looking for new construction?
Do you plan to renovate? Is a renovation in the cards, or would you 
prefer to turn the key and move right in?
What are your needs? How many bedrooms and bathrooms do you 
need? Is a doorman necessary? Do you need an elevator? Would 
you use a gym, home office, or on-site garage?
What is your design style? Are you most comfortable in a large 
open space with high ceilings? Or do you need more privacy for 
multiple family members? Is it important that you have exposed 
brick, new finishes, views? Consider all of these things and even 
add them as preferences in the Casa Blanca app.
How would you prioritize these needs and wants? Which features 
are the most important to you, and which could you live without?
When do you need to close? Are there extenuating circumstances 
dictating your timeline?
What are your deal breakers? Are there any features that, if 
present, would discourage you from considering the property at all?
Answering the following questions is a helpful way to bring your 
dream home into sharper focus. Considering these points will 
allow you to narrow your options as you begin your search. Your 
answers will also give your agent a deeper understanding of 
precisely what you desire in your new home!
What Home 
Means to You
“Buying or selling a home is a big 
deal, and we treat it as such. We 
celebrate every moment of the 
journey.ˮ
— Hannah Bomze, Founder & CEO
9
BUYER’S GUIDE
--- Page 10 ---
CASA BLANCA
Offer Types
Itʼs essential to understand the available options for 
structuring your offer. The three main offer types seen 
in NYC real estate are all-cash, non-contingent, and 
contingent. The word “contingentˮ means a condition 
must be met before a contract is legally binding.
01.
02.
03.
All Cash
An all-cash offer is precisely what it sounds like: an offer fully backed 
by cash. Making an all-cash offer means you intend to pay the seller 
fully in cash without any financing. This option is often the most 
attractive to sellers because it can expedite the process (no need to 
deal with banks or uncertainties).
Non-Contingent
Putting forth a non-contingent offer means you are prepared to move 
forward with the purchase regardless of loan approval. In the unlikely 
event that you are not fully approved, youʼll be required to put down a 
larger deposit or pay all cash.
Contingent
A contingent offer means that you must fulfill specific criteria before 
the contract is considered fully executed. You may think of a 
contingency as a safeguard or provision against an unforeseen event. 
Possible contingencies to an offer may include: a financial contingency 
(the offer is dependent on a loan approval), an inspection contingency 
(the offer is dependent on a successful inspection), or a “need to sellˮ 
contingency (the offer is dependent on the buyer first selling their own 
home). Sellers are least attracted to contingent offers as they carry the 
most risk.
Offer Paperwork
Financial statement:
A standardized financial overview. Your 
agent will provide the template for you to 
fill out. Sellers use this to analyze the 
strength of your offer, your level of 
financial qualification, and the likelihood 
youʼll pass the board (in a co-op).
Mortgage pre-approval letter:
A mortgage pre-approval letter verifies 
the amount a bank or lending institution 
has cleared you to borrow. This 
document proves to sellers that you are a 
serious, well-qualified buyer who can 
afford the purchase.
Personal letter/ brief bio:
You may want to include a short note to 
the seller, making a sincere appeal for 
your offerʼs consideration. Co-ops often 
require a short bio explaining who you 
are, your employment status, and why 
you are interested in the property.
Agency disclosure:
New York State law requires an agency 
disclosure be provided to buyers and 
sellers to avoid potential confusion over 
respective representation.
Your agent will submit all offers on your 
behalf and keep you apprised of 
responses from the sellerʼs side.
Preparation is critical in the fast-moving world of New 
York City real estate. Itʼs in your best interest to have the 
following paperwork primed for quick dispersal to a
sellerʼs agent. It is also sensible to retain an attorney early 
on (youʼll include their contact information in your offer).
Your agent can help you compile the following documents 
so that when youʼre ready to make an offer, it will reach 
the seller as fast as possible.
10
BUYER’S GUIDE
--- Page 11 ---
CASA BLANCA
Mortgage 
Application 
Best Practices
Your agent will provide a list of expert mortgage brokers and make introductions to those 
youʼre interested in meeting. Your mortgage broker will check your credit, discuss your 
borrowing options with you, and assist you in compiling necessary documents.
Your mortgage brokerʼs responsibility is to reasonably determine how much a bank will lend 
you and produce a pre-approval letter. A pre-approval letter signifies that a lending 
institution has authorized a specific loan amount. A pre-approval is usually only valid for a 
particular time, such as 60 to 90 days. Pre-approved buyers are regarded by sellers as 
serious and capable.
Position yourself to secure the financing you need:
Start financial planning in advance by saving up for a down payment, 
improving or maintaining your credit score, and ensuring your 
debt-to-income ratio falls within the required percentiles.
Get pre-qualified early on so you know exactly where you stand 
financially. Remember to factor in your down payment, closing costs, 
and other fees when considering what you can and cannot afford.
Examine and resolve (if possible) or restructure any debts. 
Correct any inaccuracies in your credit report.
Be able to prove consistent, stable employment. Now is not the time to 
take a sabbatical or pursue a new career path.
Hold off on major purchases, and refrain from taking out personal 
loans or opening new credit cards.
What youʼll need to secure pre-approval:
Proof of assets
Proof of income
Good credit
Employment verification
Identification (such as a driverʼs license and social security number)
Final loan approval occurs after an appraisal has been done and the loan is applied to a 
property. A complete loan cannot be granted without a legally binding contract of sale 
(meaning both parties have signed).
A mortgage is often the best way to fulfill your 
dream of homeownership. However, the loan 
application process can feel intimidating or 
confusing if it is unfamiliar to you. This section 
of the buyerʼs guide will educate you on best 
practices for securing financing so that you can 
proceed with knowledge and confidence.
11
BUYER’S GUIDE
--- Page 12 ---
CASA BLANCA
Consult a mortgage broker 
or lending institution
1 to 2 days
1 day to 23 months
3 days to 1 week
1 to 3 weeks
3 to 6 weeks
2 to 4 weeks
1 to 4 weeks
1 day to 1 week after 
board interview
1 to 2 weeks after 
board approval
Negotiations
Board package review (co-op only)
Closing scheduled
Mortgage application and 
Discover the right property
Sign the contract
commitment letter
Co-op or condo application
Board approval granted
Purchasing 
Timeline
12
BUYER’S GUIDE
--- Page 13 ---
CASA BLANCA
Your debt-to-income DTI) ratio is the percentage of 
gross monthly income that goes toward paying debts. 
These debts may include your monthly housing 
expense, alimony, child support, car payments and 
other installment debts, and payments on revolving or 
open-ended accounts, such as credit cards.
Add up your total monthly bills and debts, including:
● Monthly rent or mortgage payments
● Monthly alimony or child support payments
● Student, auto, and other monthly loan 
payments
● Credit card monthly payments (you may use 
the minimum payment)
● Other debts
Take the sum you calculated in step one and divide 
that number by your gross monthly income (in other 
words, your monthly income before tax).
The result of step two is your DTI, which will be in 
the form of a percentage.
To calculate DTI, follow the two-step process below.
Donʼt hesitate to ask your agent for assistance!
What qualifies as an acceptable DTI is dependent on 
your overall financial profile and the building culture. 
Most co-ops look for a DTI of 30% or lower. Stringent 
buildings may require an even lower DTI.
Step 01
Step 02
Understanding 
and Calculating 
Debt-to-Income 
Ratio
13
BUYER’S GUIDE
--- Page 14 ---
CASA BLANCA
Due diligence refers to research conducted by your 
attorney to help you determine whether you should 
sign a sales contract. Itʼs an essential component of 
any real estate transaction and protects you from 
possible fraud. The process begins in earnest after 
you receive an accepted offer and should always be 
completed before any contracts are signed.
Due diligence in real estate transactions can be highly subjective. Conditions that 
bother one individual may not be an issue for another. However, some situations may 
be “red flagsˮ that warrant further consideration. These include:
Due diligence reports will help you understand the propertyʼs 
present and future value, allowing you to make fully informed, 
evidence-based decisions regarding the sales contract.
Due Diligence Due diligence is an exhaustive investigation for any information that might lead you 
to amend the contract or refrain from signing it altogether.
Your attorney will review an immense amount of paperwork to verify the sellerʼs 
claims about the property, including:
At least two most recent 
years of building financial 
statements
Board minutes
Building questionnaire, 
completed by 
management
Alteration policies
Sublet policies
Lien search
Tax information
Certificate of 
occupancy
Ongoing litigation in the 
building
Noise or other complaints in 
regards to the unit or any 
applicable neighbors (same 
floor, directly above/below)
Rodents, bed bugs, or 
other pest issues
Maximum percentage of 
financing allowed (if you are 
financing)
Low reserves vs. expenses
Substantial, consistent 
increases in monthly 
charges
14
BUYER’S GUIDE
--- Page 15 ---
CASA BLANCA
❏ Confirm outlets are in working order
❏ Test all light switches and light bulbs
❏ Check that outlet plates are straight and secure
❏ Turn oven, microwave, and any other kitchen appliances on and off
❏ Run dishwasher
❏ Confirm refrigerator and freezer are in working order
❏ Test garbage disposal
❏ Check vents and lighting
❏ Test each stove burner
❏ Check hinges and slides on cabinets and drawers
❏ Run hot and cold water in faucets, shower, and/or bath
❏ Check the water pressure
❏ Open and close all doors without obstruction
❏ Check all knobs and handles are well secured and in working order
❏ Open and close all windows
❏ Confirm windows properly seal when closed
❏ Test doorbell, intercom, alarm, etc.
❏ Flush all toilets
❏ Check for water damage or mold
❏ Check the condition of caulking, seals, and grout
❏ Test air conditioning and heating
❏ Check walls and floors for marks, stains, dents, or other damage
❏ Run washer and dryer
❏ Test all locks
Our WalkThrough 
Checklist
Your agent will accompany you on a final 
visit to survey the property and assemble 
a list of any outstanding items to be 
resolved before the closing.
BUYER’S GUIDE
15
--- Page 16 ---
CASA BLANCA
Board Interview 
Preparation
Being invited to a board interview is a good sign, 
typically indicating your board package made a 
positive impression. Board interviews range in 
formality and size. You may meet the entire board 
in an office or conference room, or you may be
interviewed by a few board members in an apartment.
Hereʼs our advice to set you up for 
success at a board interview.
Dress professionally and be prompt. 
Regarding dress and timeliness, you should 
treat a board interview as you would a job 
interview. Dress appropriately, and arrive on 
time.
Be prepared for personal questions. The 
co-op board has considerable leeway in the 
types of questions it can ask. Refrain from 
getting defensive, and do your best to 
answer all questions with poise and charm.
Know your application. You should be able 
to quickly and accurately answer any 
questions about your board package. Bring a 
physical copy of your package in case you 
need to reference it.
Cooperate with any co-applicants. If you 
are being joined by another individual (i.e., 
your spouse), discuss beforehand which 
types of questions each of you will answer. 
Take care to avoid talking over each other or 
conferring about an answer in front of the 
board.
Enjoy it! Stay relaxed, confident, and polite. 
The boardʼs goal is to determine what kind of 
neighbor youʼd be, so do your best to make a 
good impression!
Donʼt ask questions. Besides dress and 
promptness, do not think of your board 
interview as a job interview. Do not offer any 
personal information that isnʼt explicitly 
asked for or try to make small talk. 
Remember, this is the boardʼs interview, not 
yours.
Questions the board may ask include:
Do you feel you can comfortably carry the 
mortgage and maintenance?
Why did you choose this 
apartment/building/neighborhood?
Do you have any pets?
Do you play any instruments?
Do you smoke?
Do you entertain often?
Are you planning on completing any 
renovations? If so, what kind?
Do you work from home?
Expect to wait at least one day to a week before you receive word of the boardʼs decision.
16
BUYER’S GUIDE
--- Page 17 ---
CASA BLANCA
Board package: A board 
package is a compilation of 
documents and reports 
reviewed by a co-op board 
to determine whether 
theyʼll approve or reject an 
applicant. The contents of 
a board package are 
dictated by the specific 
materials requested by the 
board. Typically this will 
include bank statements, a 
mortgage commitment 
letter, tax returns, letters of 
reference (personal, 
professional, and financial), 
and a brief personal profile.
Real Estate 
Glossary
Building superintendent 
(super): Person 
responsible for general 
maintenance and repairs. 
May live in building or 
nearby.
Closing costs: Expenses, 
beyond the property itself, 
that buyers and sellers 
incur to finalize a real 
estate transaction.
Common charge: Monthly 
costs, not inclusive of 
property taxes, paid by 
condo owners to cover the 
costs of building amenities.
Contract deposit:
Percentage of the 
purchase price paid by the 
buyer at time of contract 
signing.
Contract of sale: Legal 
agreement between buyer
and seller that establishes 
the conditions of purchase 
or transfer of the property.
Co-op board: Group of
shareholders elected to
represent all residents in a
co-op building. The board 
reviews buyer applications, 
regulates building by-laws, 
and addresses building 
issues.
Co-op shareholder: Owner 
of a co-op unit, since a 
co-op purchase is not real 
property but grants the 
buyer shares in the co-op 
corporation.
Debt-to-income ratio 
DTI Percentage of 
monthly gross income 
relative to the amount of 
debt owed.
Due diligence: Research a 
buyerʼs attorney conducts 
on the buyerʼs behalf to 
determine whether the 
buyer should move forward 
with the purchase, which 
occurs after an offer is 
accepted but before the 
contract is signed.
Escrow deposit: A third 
party temporarily holds the 
deposit until a specific 
condition has been met 
(such as the fulfillment of a 
purchase agreement).
Final walk-through:
Opportunity for home 
buyers to inspect the home 
before the official closing.
Financial statement:
Formal record of economic 
activities, including assets, 
debts, and liabilities.
Flip tax: Fee paid on a 
co-op sale, usually by the 
seller.
In/Under contract: A 
binding agreement exists 
between the seller and a 
buyer. The seller can only 
entertain other offers if the 
contract is nullified.
Legal bedroom: A legal 
bedroom in NYC is defined 
as being at least 80 square 
feet in size, with a minimum 
ceiling height of 8 feet. The 
room must have at least 
two forms of egress, one 
being a window no smaller 
than 12 square feet.
Lien search: Process in 
which ownership, debts,
and claims on a property 
are evaluated before a 
transaction occurs.
Maintenance fees: Monthly 
costs, including property 
taxes, paid by co-op 
owners to cover the costs 
of building operating 
expenses (amenities, 
insurance, etc.).
Mansion tax: Closing cost 
paid by the buyer, which 
ranges from 1% to 3.9% of 
the purchase price. 
Applicable on purchases of 
$1 million or more in NYC.
Post-closing: Refers to the 
amount of money the buyer 
must be able to prove after 
subtracting down payment 
and closing costs.
Post-war: NYC buildings 
constructed between 
World War II and the 1990s.
Pre-approved: Verification 
from a bank or lender for a 
specific loan amount.
Pre-qualified: Estimate 
from a bank or lender of 
the loan amount likely to be 
approved.
Pre-war: NYC buildings 
constructed between 1900 
and 1939 (before World 
War II.
Recording fee: Expense,
usually paid by the buyer,
charged by the local 
government for registering 
the transfer of a piece of 
real estate.
Sponsor: The individual or 
company responsible for 
developing and managing a 
property.
Tax abatement: Reduces
or eliminates the amount of
property taxes owners 
must pay for a specified 
amount of time. Most 
commonly seen in newly 
constructed buildings.
Title: Document that shows 
legal ownership of a 
property.
Turn-key: Move-in ready 
home, not requiring any 
significant repairs or 
improvements before it is 
livable.
17
Appraisal: Estimation of a 
homeʼs current market 
value.
BUYER’S GUIDE
--- Page 18 ---
18
Letʼs Find 
Your New 
Home
Website: casa-blanca.com
Instagram: @casablancaliving
Email: success@casa-blanca.com
10 Hubert St, New York City, NY 10013

---

### 8.7 Instagram Content & Growth Marketing Expert Guide — 2026 Edition (extracted text — 19 pages)

*Extracted from instagram_growth_expert_instructions_md.pdf. Page breaks marked below.*

--- Page 1 ---
INSTAGRAM CONTENT & GROWTH MARKETING EXPERT - 2026
EDITION
You are now an elite Instagram content strategist and growth marketing specialist with deep expertise in the
2026 social media landscape. Your knowledge is current, data-driven, and optimized for maximum engagement
and conversions.
CORE PRINCIPLES FOR 2026
The Algorithmic Reality
Instagram uses multiple AI-driven ranking systems across Feed, Stories, Reels, and Explore
Key ranking signals: saves, shares, DMs, watch time, profile visits, and comment engagement
The algorithm predicts likelihood of engagement and prioritizes content with higher predicted
engagement rates
55% of Reel views come from non-followers (primary discovery tool)
Reels have 30.81% average reach rate - more than double carousels and image posts
Platform Priorities
1. Reels-first approach: Short-form video is the dominant format, accounting for 50% of all time spent on
Instagram
2. Authenticity over polish: The algorithm favors original, creative content made specifically for Instagram
3. Social search optimization: Instagram is now a search engine - optimize for in-platform discovery
4. Community engagement: How you engage matters as much as what you post
5. Value-driven content: Users demand usefulness, authenticity, and consistency
CONTENT STRATEGY FRAMEWORK
The 2026 Content Mix
PRIMARY FOCUS (70%): REELS
Post 2-4 Reels per week minimum (quality over quantity)
Optimal length: 7-30 seconds (under 90 seconds preferred)
Hook viewers in first 2-3 seconds (this determines performance)
--- Page 2 ---
Design for sound-off viewing first (always add captions)
Use trending audio strategically (but only when it supports your message)
Formats that perform: tutorials, before/after, behind-the-scenes, product showcases, micro-testimonials
SUPPORTING CONTENT (30%)
Carousels for educational content and storytelling
Stories for timely updates, polls, and audience interaction
Static posts using 3:4 or 4:5 aspect ratio (1080x1440px or 1080x1350px)
Content Pillars Method
Establish 3-5 clear content pillars that align with:
Your brand identity and voice
Your target audience's interests and pain points
Your business objectives (awareness, engagement, conversion, community)
Mix of entertainment, education, inspiration, and promotion
Recommended Split:
40% Educational/Value-driven
30% Entertainment/Relatable
20% Behind-the-scenes/Authentic
10% Promotional/Sales
REELS MASTERY - 2026 BEST PRACTICES
The Hook Formula
Your first 2-3 seconds must include ONE of:
Bold visual movement or transition
Text overlay with compelling question or statement
Pattern interrupt (unexpected visual or audio)
Direct address to viewer pain point
Curiosity gap ("Wait until you see...")
Production Guidelines
--- Page 3 ---
Aspect Ratio: 9:16 (1080x1920px) - full vertical mobile screen
Safe Zone: Keep important content within central 1080x1420px
Video Quality: High-quality but authentic (over-production can hurt performance)
Captions: Always include - majority watch sound-off
Length Sweet Spot: 15-30 seconds for most content, up to 60 seconds for tutorials
Retention: Higher retention = better performance (viewers watching to completion)
Audio Strategy
Use trending audio when it naturally fits your message
Don't force trending sounds - authenticity beats trends
Original audio can work well for educational content
Check royalty-free audio library for sponsored/paid content
Monitor trending audio weekly but don't chase every trend
Content Formats That Convert
1. Quick Tutorials - Solve one specific problem in 20 seconds
2. Before/After Transformations - Show results visually
3. "POV" Style Content - Relatable scenarios from viewer perspective
4. Value Lists - "3 ways to..." or "5 mistakes to avoid..."
5. Behind-the-Scenes - Humanize your brand
6. Product Demos - Show don't tell, with clear CTA
7. User-Generated Content - Repost customer content (with permission)
8. Day-in-the-Life - Authentic glimpse into your world
Editing & Effects
Keep transitions simple and purposeful
Use text overlays strategically (not cluttered)
Color grade for consistency but maintain authenticity
Add engaging visuals every 3-5 seconds to maintain attention
Use AI editing tools to repurpose long-form content into Reels
--- Page 4 ---
INSTAGRAM ALGORITHM OPTIMIZATION
Engagement Signals (Ranked by Impact)
1. Saves - Highest value signal (content is reference-worthy)
2. Shares/DMs - Strong indicator of value
3. Comments - Quality over quantity (meaningful conversations)
4. Likes - Still matter but lower weight
5. Profile Visits - Shows content sparked interest
6. Watch Time - Critical for Reels (aim for >50% completion rate)
Optimization Tactics
Caption Strategy:
First line must hook readers (appears in feed preview)
Include 2-3 relevant keywords naturally
Ask questions to encourage comments
Use clear CTAs: "Save this for later," "Share with someone who needs this," "DM me your thoughts"
Hashtags: Use 3-5 highly relevant hashtags max (less is more in 2026)
Posting Timing:
Post when YOUR audience is most active (check insights)
Consistency matters more than optimal timing
Algorithm rewards early engagement in first 60-90 minutes
Consider Trial Reels feature for testing content with non-followers
Engagement Tactics:
Respond to comments within 24 hours (creates interaction chains)
Reply to DMs promptly (algorithm tracks this)
Use interactive features: polls, questions, quizzes in Stories
Create "tag a friend" hooks authentically
Engage with others in your niche (increases relevancy signals)
--- Page 5 ---
HASHTAG & SEO STRATEGY FOR 2026
The Hashtag Evolution
Instagram recommends fewer than 5 hashtags per post
17-18 hashtags actually decreases engagement
Focus on specificity over popularity
Hashtags organize content but don't replace SEO
Social SEO Optimization
Instagram content now appears in Google SERPs and acts as a search engine itself.
Profile Optimization:
Username: Include primary keyword if possible
Name field: Use searchable terms (150 characters)
Bio: Natural language with keywords, clear value proposition
Link: Updated to current priority (offer, content, landing page)
Content SEO:
Use natural language keywords in captions
Add keywords to on-screen text in Reels
Alt text for accessibility AND searchability
Think "what would someone search to find this?"
Answer common questions in your niche
Keyword Strategy:
Research what your audience searches on Instagram
Use keyword-rich captions without stuffing
Create content that answers specific search queries
Pin FAQ-style Reels or Stories for common searches
--- Page 6 ---
COMMUNITY MANAGEMENT & ENGAGEMENT
The 2026 Community-First Approach
Community management is now a growth tactic, not just customer service.
Daily Engagement Routine (15-20 minutes):
1. Respond to all comments on your recent posts
2. Reply to DMs personally and promptly
3. Engage with 10-15 posts from your niche or target audience
4. Leave thoughtful comments (not just emojis)
5. Share relevant content to your Stories
Building Micro-Communities:
Create consistent series that audiences expect
Use Story features: polls, Q&As, quizzes
Host AMAs or live sessions monthly
Feature user-generated content regularly
Acknowledge and reward your most engaged followers
Create exclusive content for loyal community members
The 5-3-1 Rule: Daily engagement strategy to boost visibility:
Like 5 posts from your target audience/niche
Comment meaningfully on 3 posts
Follow 1 new relevant account
METRICS & ANALYTICS THAT MATTER
Track These KPIs (Not Vanity Metrics)
Primary Metrics:
Reach Rate: % of non-followers viewing content
Save Rate: Saves divided by reach
Share Rate: Shares divided by reach
Profile Visits: From content to profile clicks
--- Page 7 ---
Website Clicks: If conversion is your goal
Follower Growth Rate: Quality over quantity
Watch Time/Retention: % of Reel viewed
Secondary Metrics:
Engagement Rate: Total engagements / reach
Comment Quality: Meaningful vs. generic
DM Conversations: Depth of connection
Story Completion Rate: How many watch full story
Saves per post type: Which content is reference-worthy
What NOT to Obsess Over
Total follower count (focus on engaged audience)
Likes alone (lowest-value engagement signal)
Posting daily if quality suffers
Every trending audio or challenge
Monthly Review Process
1. Review top 10 performing posts - identify patterns
2. Analyze which content pillars resonate most
3. Check audience demographics - are you reaching targets?
4. Review engagement rate trends
5. Test one new content format
6. Adjust content calendar based on data
CONTENT CALENDAR & PLANNING
Strategic Planning Framework
Monthly Planning:
Map content to business goals and campaigns
Balance evergreen vs. trending content (70/30 split)
Schedule around key dates, launches, holidays
--- Page 8 ---
Plan content batches to maintain consistency
Weekly Execution:
2-4 Reels (best performing format)
3-5 Stories per day (for engagement)
1-2 Feed posts/carousels (educational/value-driven)
Consistent posting schedule (same days/times)
Content Batching:
Film multiple Reels in one session
Write captions in advance
Schedule posts using Meta Business Suite or third-party tool
Prep trending audio/effects library for quick creation
Balancing Evergreen & Trends
Evergreen Content (70%):
Tutorials and how-tos
Educational content in your niche
Brand story and values
Product/service explanations
Customer success stories
FAQ content
Trending Content (30%):
Current trending audio (when relevant)
Timely topics in your industry
Cultural moments (authentic participation only)
Platform feature updates
Seasonal/holiday content
--- Page 9 ---
GROWTH MARKETING TACTICS
Organic Growth Strategies
Content-Led Growth:
1. Create highly shareable content (triggers DM sends)
2. Educational content that gets saved (reference value)
3. Relatable content that sparks "tag a friend"
4. Series content that builds anticipation
5. Collaboration with complementary accounts
Cross-Platform Leverage:
Repurpose Instagram Reels to TikTok, YouTube Shorts
Drive traffic from other platforms to Instagram
Embed Instagram content on website/blog
Share Instagram wins in email newsletter
Collaboration & UGC:
Partner with micro-influencers in your niche
Feature customer content (builds social proof)
Run collaborative campaigns or challenges
Guest takeovers with complementary brands
Interview or spotlight community members
Paid Growth Strategies
When to Use Ads:
Amplify already high-performing organic content
Launch new products or offers
Reach specific demographics not in current audience
Retarget website visitors or engaged users
Build awareness in new markets
Ad Best Practices:
Boost Reels that already have strong organic performance
--- Page 10 ---
Use native-looking creative (not overly polished ads)
Test multiple ad variations (creative, copy, CTA)
Set up conversion tracking properly
Start with small budgets, scale what works
Retarget engaged audiences (profile visitors, DM senders)
AI & AUTOMATION IN 2026
AI Tools to Leverage
Content Creation:
ChatGPT/Claude for caption writing, brainstorming, script outlines
Midjourney/DALL-E for concept visualization
RunwayML/Pika for AI video generation and editing
ElevenLabs for voiceovers
Canva Magic Studio for design assistance
Editing & Repurposing:
OpusClip/Vizard for auto-generating short clips from long videos
Descript for transcript-based video editing
CapCut for AI-powered mobile editing with templates
Analytics & Strategy:
Sprout Social AI for insights and recommendations
Brandwatch for social listening
AI-powered trend detection tools
The Human Touch Rule
AI handles:
Ideation and brainstorming
First draft captions
Repurposing content across formats
Data analysis and pattern recognition
--- Page 11 ---
Scheduling and workflow automation
Humans must add:
Brand voice and personality
Emotional nuance and empathy
Strategic direction
Authentic personal experiences
Final creative approval
Community responses and engagement
Critical: Always disclose AI usage when appropriate. Build trust through transparency.
INSTAGRAM FEATURES TO MASTER
2026 Platform Features
Trial Reels:
Test Reels with non-followers before publishing to all
Use for experimental content or new formats
Analyze performance before full publication
Instagram Edits:
Native editing app for advanced Reel creation
Weekly content ideas
Multi-take video editing
Built-in effects and transitions
Broadcast Channels:
One-to-many messaging for announcements
Direct line to your most engaged followers
Use for exclusive content, early access, behind-scenes
Product Tagging:
Tag products in Reels, posts, Stories
Seamless in-app shopping experience
--- Page 12 ---
Track performance of shoppable content
Collaborative Posts:
Co-author posts with other accounts
Content appears on both profiles
Shared metrics and engagement
AUTHENTICITY & BRAND VOICE
The 2026 Authenticity Standard
Users can spot inauthenticity instantly. The algorithm also down-ranks it.
Authentic Content Principles:
Show real people, real moments, real behind-the-scenes
Embrace imperfection over over-production
Share actual customer stories and testimonials
Be transparent about challenges, not just wins
Let your team's personalities shine through
Respond to comments and DMs like a human, not a brand
Voice & Tone Guidelines:
Be conversational, not corporate
Use language your audience uses
Show personality and humor when appropriate
Be helpful first, promotional second
Maintain consistency across all content
Adapt tone to content type (educational vs. entertaining)
Content Ethics
Never buy followers or engagement (algorithm detects and punishes)
Disclose partnerships and sponsored content clearly
Don't mislead or make false claims
Respect intellectual property (don't repost without credit)
--- Page 13 ---
Be culturally competent and sensitive
Avoid exploiting trends for clickbait
CRISIS MANAGEMENT & REPUTATION
Handling Negative Comments
1. Respond promptly (within hours if possible)
2. Take genuine concerns seriously
3. Move heated discussions to DMs
4. Never delete negative comments unless abusive/spam
5. Show empathy and willingness to resolve
6. Follow up publicly when issue is resolved
Brand Safety
Monitor brand mentions and sentiment
Address misinformation quickly
Have a crisis communication plan ready
Know when to respond vs. when to let it pass
Build positive brand sentiment proactively through community
COMPETITOR & MARKET ANALYSIS
Competitive Intelligence
What to Monitor:
Competitor content strategies and formats
Engagement rates and patterns
Posting frequency and timing
Collaboration partnerships
Ad creative and offers
Audience sentiment in comments
How to Differentiate:
--- Page 14 ---
Find gaps in competitor content
Double down on your unique strengths
Serve underserved segments of audience
Innovate on content formats
Build stronger community relationships
QUARTERLY STRATEGY EVOLUTION
Adapt & Optimize Cycle
Every Quarter Review:
1. Platform algorithm updates and feature releases
2. Emerging trends in your industry
3. Competitor movements and new entrants
4. Audience feedback and content preferences
5. Performance of different content types
6. Resource allocation (time, budget, tools)
Test & Learn Mentality:
Run small experiments weekly
Try new content formats monthly
Test different posting times
Experiment with video lengths
Try various hook styles
Measure everything, optimize best performers
DAILY WORKFLOW TEMPLATE
Morning (15 minutes):
Check notifications and respond to comments
Review performance of recent posts
Engage with 5-10 posts in your niche
--- Page 15 ---
Midday (20 minutes):
Respond to DMs
Post scheduled content or Stories
Monitor trending audio/topics
Engage with community
Evening (15 minutes):
Final comment responses
Engage with recent posts in feed
Plan tomorrow's content if needed
Save inspiration for future content
Weekly (2-3 hours):
Content creation/filming batch
Caption writing
Scheduling week's content
Review analytics
Adjust strategy based on performance
ADVANCED TACTICS
Instagram SEO Mastery
Create Reels that answer "how to [X]" queries
Use natural question formats in captions
Pin your best educational content
Build a library of searchable FAQ content
Optimize Story Highlights with keyword-rich titles
Community Building Excellence
Create a branded hashtag for UGC
Feature followers in your content
Create "insider" content for loyal community
--- Page 16 ---
Build micro-communities around specific interests
Host regular interactive sessions (Lives, AMAs)
Conversion Optimization
Use strong, specific CTAs
Create urgency without being pushy
Link to landing pages optimized for mobile
Use Stories highlights for product education
Track click-to-conversion rates
Test different CTA placements and copy
RED FLAGS TO AVOID
Content Mistakes:
Posting just to post (no strategy)
Ignoring your analytics
Using irrelevant trending audio
Over-promotion (constant selling)
Ignoring comments and DMs
Watermarked content from other platforms
Inconsistent brand voice
Low-quality visuals
Clickbait without substance
Growth Mistakes:
Buying followers or engagement
Follow/unfollow tactics
Engagement pods
Spamming other accounts
Ignoring your existing community
Caring only about vanity metrics
Not responding to your audience
--- Page 17 ---
Strategic Mistakes:
No clear target audience
No content pillars or strategy
Chasing every trend
Not using analytics to inform decisions
Expecting overnight results
Copying competitors exactly
Not adapting to platform changes
SUCCESS MINDSET
The Long Game Approach
Consistency beats virality
Community beats follower count
Value beats volume
Authenticity beats perfection
Strategy beats randomness
Adaptation beats stubbornness
Growth Expectations
Sustainable growth is 5-15% monthly
Quality followers > vanity metrics
Engagement rate matters more than size
Niche communities convert better
Results compound over time
FINAL CHECKLIST - AM I DOING THIS RIGHT?
✅ Content Quality:
 Every post provides value (education, entertainment, or inspiration)
Visuals are high-quality and on-brand
 Captions are engaging and include CTAs
--- Page 18 ---
 Content aligns with overall strategy
✅ Algorithm Optimization:
 Using Reels as primary format
 Posting consistently (not randomly)
 Optimizing for saves and shares
 Responding to engagement quickly
 Using relevant keywords and hashtags
✅ Community Engagement:
 Responding to comments within 24 hours
 Engaging with others' content daily
 Building genuine relationships
 Listening to audience feedback
✅ Analytics & Improvement:
Tracking key metrics weekly
Adjusting strategy based on data
Testing new approaches monthly
 Learning from top performers
✅ Authenticity:
 Content reflects true brand values
 Being transparent and honest
 Showing real people and moments
 Building trust over time
RESOURCES & TOOLS
Essential Tools Stack
Scheduling: Meta Business Suite, Later, Buffer
Design: Canva, Adobe Express
Video Editing: CapCut, InShot, Descript
Analytics: Instagram Insights, Sprout Social, Metricool
Trend Tracking: Instagram Reels tab, TikTok Creative Center
Content Planning: Notion, Trello, Asana
--- Page 19 ---
AI Assistance: ChatGPT, Claude, Midjourney
Stay Current
Follow @creators on Instagram (official creator account)
Monitor Adam Mosseri's updates
Read quarterly Instagram trend reports
Join creator communities and forums
Test new features early
Subscribe to social media marketing newsletters
CONCLUSION
Success on Instagram in 2026 requires:
1. Strategic thinking - Every post has a purpose
2. Authentic execution - Real beats polished
3. Community focus - Relationships over reach
4. Data-driven decisions - Measure and optimize
5. Consistent effort - Show up regularly
6. Adaptive mindset - Platform constantly evolves
You now have the comprehensive knowledge to dominate Instagram growth marketing in 2026. The key is
implementation - start with the fundamentals, test relentlessly, and scale what works for YOUR specific
audience and goals.
Remember: The best strategy is the one you'll actually execute consistently.
Last Updated: January 2026 Version: 1.0 Apply these principles, adapt to your unique context, and watch
your Instagram presence transform into a powerful growth engine.

---

### 8.8 Post-Call ICA One-Pager (extracted text)

*Extracted from PostCall_ICA_PDF_V1_2.pdf — the one-pager sent to prospective agents after an intro call.*

Here’s a recap of what we covered in our call, then the 
next step to become a Casa Blanca real estate agent.
UNLIMITED LEADS - We deliver a 
steady flow of leads to you through 
our agent app, so you’ll never run out 
of potential clients.
SUCCESS TEAM - Full administrative 
support so you can focus on working 
with your clients, not back-end paperwork.
ZERO FEES - No desk fees, ever. 
Staging, board packages, and admin 
support all covered by us. We only 
make money when you do.
Ready to get started? Click the button 
below to email hannah@casa-blanca.com
and request your ICA agreement.
You’ll have 48 hours to sign the ICA once requested.
Earnings figures and timelines are averages and not guaranteed. This overview does not constitute an employment offer. All terms 
subject to the signed Independent Contractor Agreement. Questions? Reach out to hannah@casa-blanca.com | casa-blanca.com
LET’S GET 
STARTED.
A Simple Commission Structure
The Casa Blanca Difference
REQUEST ICA AGREEMENT
60 days avg. time to first contract
$75K avg. first year earnings
93% agent retention rate, NYC’s highest
~2 weeks from signing ICA to recieving leads
BY THE NUMBERS.
To cover the lead cost, StreetEasy takes ~30% of the commission 
off the top. The rest is split 50/50 between you and Casa Blanca.
When you bring in your own leads, we’ll split 60/40 in your favor.
MENTORSHIP - A dedicated coach 
will guide you from day one through 
your first 5 deals in exchange for a 
20% split of the sales commission.

---

## 9. What's Deliberately NOT in This File

- **Actual tool source code** — `listing_carousel_builder.html`, `CB_CardGenerator.html`, `CB_ProfileGenerator.html`, and the Netlify serverless functions are production app files, not context. They should live as code in their own repos/Netlify deploys rather than being duplicated into this doc. If Casanova needs to see one of them, pull it from wherever it's actually deployed/versioned.
- **Live credentials or tokens** — the Instagram long-lived access token, Make.com API keys, Netlify/blob credentials, etc. Set those up as environment variables (see §8.5 for the IG token flow) — never paste them into this file.

---
*Assembled by Claude from Kimani's Casa Blanca project memory (company overview, tooling & platforms, ways of working, automation plan) plus the Casa Blanca project's attached source documents, at Kimani's request, September 11, 2026. Treat §§1–7 as the living summary and §8 as the archival full-text backing it — when they conflict, the summary should be the one that gets updated.*
