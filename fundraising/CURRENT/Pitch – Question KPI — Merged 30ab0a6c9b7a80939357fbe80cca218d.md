# Pitch – Question / KPI — Merged

---

## 1. Vision & Mission — Why do we exist / what’s our goal?

### Key Questions

- **What is the long-term vision of the company (10 years)?**
    
    Become the YouTube of AI — the platform where anyone can create, share, and monetize AI-powered experiences, as vibe coding turns app creation from a professional skill into something anyone can do. AI compute is the new electricity powering the next generation of apps. Millions of creators building specialized apps (calorie trackers, story generators, game mods), billions of users paying with one wallet.
    
- **Why did you start with Pollinations?**
    
    Even devs were lost on how to build with early AI models — it started by building guides and workflows to make AI accessible to builders, then evolved into the platform itself. The next Zuckerberg could be a 16-year-old in Brazil with no credit card — we’re building their infrastructure. Open-source + AI turned out to be a killer combination, and 9 years running art/tech communities in Brazil showed us that communities create exponential value.
    
- **Where do we stand today?**
    
    Open platform serving creators in ~200 countries, processing ~1.14M daily requests across 14 providers, with ~600 new signups daily (~100 devs + ~500 end users). 3M MAU, 9,500+ unique apps, ~$5.8K/month in revenue. No paid marketing — free daily credits are the acquisition lever. Community runs itself — devs onboard each other, share starter kits, answer questions in multiple languages. Real apps in the wild — calorie trackers, bedtime story generators, game mods, Discord bots. Not demos. One creator built a Roblox game that earns real revenue — they earned $12K, not owed $12K. Pollen credit system is live and working.
    
- **What are the big steps needed to reach the long-term vision?**
    
    Seed proves creators get paid, Series A adds pure-margin digital goods, long-term we become the payment rails for AI. The key milestones: in-app Pollen payments (users buy inside any creator app), creator rev-share with automated payouts, cross-app identity (one wallet, one login, every app), app discovery and curation — become the go-to place for AI micro-apps. Scale to millions of creators as vibe coding goes mainstream.
    
- **Why is *now* the right time to build this?**
    
    AI model costs are dropping fast enough for anyone with an idea to build a real app, while demand for AI-powered experiences is exploding. Anyone can build an AI app in an afternoon now — teenagers are skipping school to vibe code, creating millions of new creators who aren’t traditional developers. Models are commoditizing — value is shifting from who has the best model to who has distribution. These micro-apps are too small for their own subscription — but one Pollen wallet across 1,000 apps works.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Total registered users | 29,700 | Tier Costs dashboard |
| Active users (all-time) | 14,415 | Economics Dashboard |
| Unique users (14d) | 9,297 | API Key Usage |
| Unique apps (14d) | 9,500 | API Key Usage |
| BYOP users (14d) | 1,639 | BYOP Dashboard |
| BYOP apps (14d) | 237 | BYOP Dashboard |
| New signups per day | ~600 (~100 devs + ~500 end users) | Pitch deck / call resolution |
| MAU (end users across creator apps) | ~3M | Pitch deck |
| End-user share of Pollen consumption | ~1% | Economics Dashboard |
| DAU/MAU ratio | ❌ Not yet tracked | — |
| MoM / QoQ growth | ❌ Needs longer time range | — |
| Adoption speed / growth rate | ❌ Needs longer time range | — |

### Nice wording for pitch

- *Consumer becomes creator*

---

## 2. Problem — What hurts today?

### Key Questions

- **What concrete problem do indie developers face today, and how do we solve it?**
    
    Building an AI-powered app is getting easy thanks to vibe coding — but turning it into a business is still broken. Without a monetization layer, success punishes you: your app goes viral and suddenly you owe thousands in compute bills. Every other platform charges the developer — so the more users you get, the more you pay. Even if they build the app, they can’t monetize it — a calorie tracker is too small for its own subscription (there’s always a resistance to subscribe and give your credit card to yet another service — “subscription hell”). Pollinations gives creators free tools, handles the compute and billing, and lets them keep the revenue — we just take a cut.
    
- **Who experiences this problem most acutely?**
    
    Solo creators and small teams with great ideas — whether technical or not — who face real barriers to monetization: they might be 17, live in Malaysia, or simply not have the infrastructure to accept payments and deliver AI compute at scale. The brilliant teenager in Brazil or Indonesia who can’t even get an API key. Also: the users of those apps — nobody wants to pay $10/month for a calorie tracker, so micro-apps can’t monetize even if they wanted to. On the other side, billions of end users who don’t even know yet what AI-powered apps can do for them — a latent market waiting for a discovery layer to unlock it.
    
- **How are developers currently solving this problem?**
    
    Using free tiers until they hit the wall — then the app just stops working. Asking users to bring their own API key — most won’t bother. Shelving projects that were gaining traction because they can’t afford success. Or just giving apps away for free because monetization is too complex — setting up a small business, going through verification with payment providers/app stores. Countless AI apps that could have taken off simply died because the creator couldn’t afford to keep the compute running.
    
- **Why are existing solutions insufficient or broken?**
    
    Existing platforms solve pieces but not the whole:
    
    - fal.ai ($4.5B) — enterprise API for image/video AI models. Charges the developer.
    - OpenRouter ($100M ARR, ~8 people) — aggregates LLM APIs into one endpoint. Charges the developer.
    - Replicate (acquired by Cloudflare Nov 2025) — run open-source AI models via API. Charges the developer.
    - Together.ai — enterprise-grade AI inference. Charges the developer.
    - HuggingFace — model hub + hosting. More a library than a platform.
    
    Key differentiator: all of them charge the developer. None pass costs to end users or handle creator payouts. Every app reinvents payments, auth, billing from scratch. There’s no YouTube for AI yet.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Registered users | 29,700 | Tier Costs dashboard |
| Active users (all-time) | 14,415 | Economics Dashboard |
| User quotes / pain statements | ❌ Needs collection | — |
| GitHub referrals | Visible in raw events, not aggregated | Raw Tinybird |
| Roblox referrals | Visible in raw events, not aggregated | Raw Tinybird |

---

## 3. Solution & Product — What are you building?

### Key Questions

- **What is your platform in one sentence *right now*?**
    
    An open AI platform where creators build apps for free and end users pay to use them — we handle compute, billing, and payouts so both sides just show up. The Creator Economy for AI.
    
- **Which core features solve the main problems?**
    
    
    | **Problem** | **Feature that solves it** |
    | --- | --- |
    | Devs can’t afford infrastructure | One API, all models — zero backend code |
    | Devs can’t monetize micro-apps | Users pay as they go — transparent, per-use |
    | Devs have no distribution | Community of builders and end-users |
    | User subscription hell | One balance, every app, full spend visibility |
    
    For creators: multi-model API access (38+ models across 14 providers), free compute grants, and a monetization toolbox (compute revenue, in-app ads, digital goods). For end users: Pollen credits that work across any app on the platform, one wallet, instant access.
    
    > Note: Pollen is for both creators and end users. The number of end users is much larger than the number of devs and potentially the much larger revenue source in the long run. If we subsidize devs by giving them credits to start, they will bring lots of paying users to us — we keep the barriers for devs as low as possible.
    > 
- **What is live today vs. on the roadmap?**
    
    In layman terms, what’s live today: one API that connects to 38+ AI models from 14 providers (“14 different keys and one master key”), a Pollen credit system where users buy credits and spend them across any app, 9,500+ unique apps built and running, developer tiers with daily free credits to get started, and a login system (OAuth) so users have one identity across apps.
    
    - **In place (MVP):** Unified API across 14 providers, Pollen credits, 9,500+ apps, developer tiers, OAuth 2.1 login, compute at scale, payment processing, creator grants, creator analytics dashboard, community.
    - **Missing / Next:** in-app Pollen payment widgets, in-app ads for creators, app discovery/marketplace for end users, creator revenue share with automated payouts, digital goods tooling.
- **How do we get from today to where we want to be long term?**
    
    Scale both sides — more creators building, more end users paying (now). Build the discovery layer so users can find apps and expand the creator monetization toolbox (post-seed). Then layer on pure-margin digital goods and become the default rails for AI experiences (Series A+).
    
    Infrastructure layer → economy layer → discovery layer → the default platform underneath millions of AI micro-apps.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Modalities supported | 5 (text, image, audio, video, music) | Platform Load |
| Models available | 38+ | Economics / Tier Costs |
| Providers aggregated | 14 | Provider Costs |
| Unique apps (14d) | 9,500 | API Key Usage |
| Avg RPM — generate.text | 599 | Platform Load |
| Avg RPM — generate.image | 475 | Platform Load |
| Avg RPM — generate.audio | 0.5 | Platform Load |
| Image generation (14d) — Flux | 7.02M images | Platform Load |
| Image generation (14d) — Zimage | 2.34M images | Platform Load |
| Peak images/min | 998 | Platform Load |
| Token throughput (avg) | 14K input / 4K output / 17K total tok/s | Platform Load |
| Token throughput (peak) | 110K total tok/s | Platform Load |
| Activation rate | ❌ Not available | — |
| Feature retention | ❌ Not available | — |

---

## 4. AI Component — Why does this need AI?

### Key Questions

- **Which parts of the platform are AI-driven?**
    
    Everything — the product end users pay for (text, image, audio, video generation), but also how we build: support, coding, feature releases, and bug fixes are all heavily AI-driven. We eat our own cooking.
    
- **What do developers actually build with Pollinations?**
    
    Real consumer-facing apps: AI art generators, chatbots, educational tools, game assets, music creators, content automation — anything where an end user interacts with AI through a creator’s vision.
    
- **If GitHub is the build layer and Discord the coordination layer: Where does Pollinations sit in this stack?**
    
    Pollinations connects creators on both sides — to AI infrastructure below and to paying audiences above. Every app is a storefront: creators bring their talent and their own users, we provide the rails that make it all work.
    
- **Do we use proprietary models or third-party APIs?**
    
    Both and everything — we aggregate third-party APIs, spin up our own endpoints on GPU providers, whatever it takes. We’re model-agnostic because the goal is giving creators and users everything they need, not locking into one source.
    
- **What is the legal situation? Risks?**
    
    Minimal — main focus is keeping dangerous/illegal content out of our pipes and giving creators moderation tools for their own apps.
    
- **Does the system improve with more usage?**
    
    Yes — more usage means better routing data, lower costs through volume negotiation, and a richer app ecosystem that attracts more end users, which attracts more creators.
    
- **How defensible is the AI advantage?**
    
    The moat isn’t AI itself — it’s the two-sided network. More creators means more apps, more apps attract more users, more users generate more revenue for creators. This flywheel is hard to replicate even if any single component can be copied.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Modalities supported | 5 (text, image, audio, video, music) | Platform Load |
| Total daily requests | ~1.14M (~1M Enter API + ~143K Legacy) | Platform Load |
| Avg RPM | 1,100 | Platform Load |
| Peak RPM (15-min window) | 3,300 | Platform Load |
| Peak/Avg RPM ratio | 3.21× | Platform Load |
| Providers aggregated | 14 | Provider Costs |
| Models available | 38+ | Economics / Tier Costs |

Full provider list: Google, Azure-2, io.net, Fireworks, Modal, Azure, ByteDance, AWS, Alibaba, ElevenLabs, Airforce, OVHcloud, Perplexity, Scaleway.

---

## 5. Target Users — Who is this for?

### 5.1 Current Target Groups / Markets

### Key Questions

- **Who is using the platform today?**
    
    Creators across ~200 countries — vibe coders, experienced devs, anyone with an idea who wants to build something with AI. What most have in common: they don’t have a lot of cash at hand. Teenagers and students experimenting with AI — many without credit cards. Creators in Brazil, Indonesia, India, Nigeria who can’t get API keys elsewhere. Roblox and Discord developers adding AI features to existing platforms. On the user side, AI enthusiasts who come to play with creative tools, many starting for free.
    
- **Can we show a simple breakdown?**
    
    500+ published apps breakdown (directional):
    
    - Creative tools: 40%
    - Chat apps: 24%
    - Dev tools: 11%
    - Games (incl. Roblox): 8%
    - Learning: 6%
    - Social bots: 5%
    - Vibes / no-code playgrounds: 5%
    
    ⚠️ *Needs better monitoring — data is directional, not precise yet. Need a MECE classification of app segments for ongoing tracking. Note: 9,500 unique apps have been active in the last 14 days; the 500+ figure above refers to the curated/categorized set.*
    
- **How do users differ by skill level, use case, and budget?**
    
    Skill levels range from first-time vibe coders to seasoned professionals — but budgets are universally low on the creator side. Most start on free credits. Tier-to-pack conversion is currently 0.92% (7-day window), which is early and pre-optimization. Roblox benchmark: 50–90% of users engage in spending, so our figure shows massive upside, not a ceiling. Immediate levers: reducing free daily Pollen allowance, making more models paid-only. End users split between casual free-tier explorers and enthusiasts willing to pay for premium AI experiences.
    
- **Who is the ideal customer profile (ICP)?**
    
    Creator side: someone with a sharp eye for what users want and the ability to execute — they’ll build something people stick with and spend on. A creator who builds a micro-app that gets traction and needs it to keep running without going broke. End user side: AI-curious consumers with $10–$20/month to spend on experiences they discover through creator apps.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| **Tier distribution** |  |  |
| Spore ($1/day free) | 17,000 users (57%) — $5,080 consumed (14d) | Tier Costs |
| Microbe ($0.10/day free) | 7,720 users (26%) — $1,460 consumed (14d) | Tier Costs |
| Seed ($3/day paid) | 4,640 users (16%) — $1,850 consumed (14d) | Tier Costs |
| Flower ($10/day paid) | 314 users (1%) — $2,100 consumed (14d) | Tier Costs |
| Nectar ($20/day paid) | 29 users (<1%) — $1,160 consumed (14d) | Tier Costs |
| **Tier usage rates** |  |  |
| Microbe | 39.4% of daily limit | Tier Costs |
| Spore | 4.52% | Tier Costs |
| Seed | 4.14% | Tier Costs |
| Flower | 6.66% | Tier Costs |
| Nectar | 19.3% | Tier Costs |
| **Paying devs by tier** | Microbe: 1, Spore: 44, Seed: 67, Flower: 56, Nectar: 15 = **183 total** | Economics Dashboard |
| Tier-to-Pack conversion (7d) | 0.92% (133 converted) | Economics Dashboard |
| Tier-to-Pack conversion (30d) | 213 converted | Economics Dashboard |
| Free vs. paid split | 78.7% free / 21.3% paid | Economics Dashboard |
| ARPU per segment | ❌ Not directly available | — |
| Churn per segment | ❌ Not available | — |

> ⚠️ **Conversion rate note:** The “~5%” figure sometimes cited refers to a broader signup-to-any-spend measure. The dashboard-verified tier-to-pack conversion is 0.92% (7d). These measure different things — use the 0.92% as the precise figure, and frame the gap as upside (Roblox: 50–90%). Verify Roblox benchmark source before using in deck.
> 

---

### 5.2 Future Target Groups

### Key Questions

- **Which user segments will you target next?**
    
    On the creator side: non-technical creators entering through vibe coding as barriers keep dropping. On the end user side: mainstream consumers discovering AI experiences through the marketplace — the latent demand we haven’t unlocked yet.
    
- **Will this change over time?**
    
    Yes — as the discovery layer launches, we’ll attract end users directly to the platform, not just through individual creator apps.
    
- **Why are these segments a natural expansion?**
    
    Same infrastructure, same Pollen economy, same monetization loop — bigger creators just bring bigger audiences, which means more wealth flowing through the system and a larger cut for us.
    
- **What product changes are required?**
    
    App discovery/marketplace so end users can browse and find experiences, and a full monetization toolbox for creators:
    
    - In-app payment widgets (1-click buy Pollen)
    - Display ads integration
    - Digital goods (payment in Pollen)
    - Subscription options for AI credits
    - Analytics dashboard
    — everything they need to turn an app into a business, without touching infrastructure.
- **Do you want to move from indie → SMB → enterprise?**
    
    It’s more like YouTube’s evolution: hobbyist creators first, then professional creators, then brands and companies — all on the same platform, all monetizing the same way through Pollen. The platform doesn’t change, the creators just get bigger.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Projected user growth curve | ❌ Financial model needed | — |
| Projected new monetized apps/month | ❌ Financial model needed | — |
| Vibe coding adoption trends | ❌ External market data needed | — |

---

## 6. Market Opportunity — How big can this be?

### Key Questions

- **What is the total addressable market (TAM)?**
    
    The global AI applications market — every AI-powered experience that a creator can build and an end user can pay for. This sits at the intersection of the AI infrastructure market ($100B+) and the creator economy ($250B+).
    
- **What is your serviceable and obtainable market (SAM / SOM)?**
    
    SAM: creators building AI-powered apps who need compute and monetization — tens of millions globally as vibe coding lowers the barrier. SOM: the first 100K creators on the platform generating revenue through Pollen within 3 years.
    
- **How fast is the market growing?**
    
    AI infrastructure is growing 30%+ CAGR, the creator economy is growing 20%+ CAGR, and vibe coding is accelerating both by turning millions of non-technical people into potential creators.
    
- **Which macro trends support this growth?**
    
    Collapsing AI model costs, the rise of vibe coding, mainstream AI adoption by consumers, and the creator economy shifting from content (video, music) to interactive experiences (apps).
    

⚠️ *TAM/SAM/SOM needs a good review with proper sources for all CAGR claims before going into the deck.*

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| TAM / SAM / SOM ($ figures) | ❌ Needs sourced research | — |
| AI infrastructure CAGR | 30%+ | ❌ Source needed |
| Creator economy CAGR | 20%+ | ❌ Source needed |
| Comparable benchmarks | Roblox, Shopify, YouTube, Unity | External |

Shopify is relevant — storefronts for creators, templates, they handle infra. We’re similar but for AI apps instead of e-commerce.

---

## 7. Business Model — How do you make money?

### 7.1 Current Model

### Key Questions

- **How do you monetize today?**
    
    Usage-based Pollen credits. 1 Pollen = $1, pay as you go, fully transparent. End users (often the creators themselves for now) buy Pollen in $5/$10/$20/$50 increments. Currently in beta with a buy-one-get-two promotion — exiting beta end of February. ~$5.8K/month total revenue (dashboard-verified; ~$194/day).
    
- **Subscription, usage-based, revenue share?**
    
    Purely usage-based today. No subscriptions, no revenue share yet. Creators already buy Pollen themselves and resell access to their users — which proves the demand is real, but the implementation is broken: creators earn little, we earn nothing from end-user usage. With proper revenue share, they could scale that and we’d both win.
    
- **Why does this model fit indie developers?**
    
    No upfront cost, no minimum spend. Daily credit allowance to start — enough to build and test a real app. Pay as you go, transparent pricing. Prices only go down over time. Creators’ costs are largely subsidized — we expect most revenue to come from users of their apps.
    
- **How is pricing structured?**
    
    $1 = 1 Pollen, and right now Pollen is priced at cost — we charge exactly what compute costs, fully transparent. No margin yet. This is deliberate: build trust, prove the loop, then layer in margin post-beta. Below-market pricing through provider partnerships, no surprise charges.
    
    Beta feedback areas of improvement: better communication (support, announcements), improve stability, clearer dev evolution path.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Revenue per day | $194 | Daily Spending |
| MRR (estimated) | ~$5,820/month | Derived ($194 × 30) |
| ARR (estimated) | ~$69,840/year | Derived |
| Total pack revenue (paid, 14d) | $3,120 | Provider Costs / Economics |
| Total tier cost (free, 14d) | $11,100 | Economics Dashboard |
| Total Pollen consumed (14d) | $14,100 (tier + pack) | Economics Dashboard |
| Free vs. paid Pollen split | 78.7% free / 21.3% paid | Economics Dashboard |
| Revenue per purchase | ~$11 ($1,355 / 123 purchases, week 02-09) | kpi.myceli.ai |
| Gross margin target | 75% | Pitch deck |
| ARPU per paying customer | ❌ Not directly available (revenue per purchase ≠ ARPU) | — |
| Payback period | ❌ Not available | — |

> ⚠️ **CAC clarification:** We have $0 paid marketing spend — acquisition is 100% organic. However, free daily Pollen grants represent a real cost to serve each user (~$3/mo per end user, more for devs). This is a freemium cost-of-acquisition, not traditional paid CAC. Distinguish clearly in the pitch: "Zero paid acquisition cost; free-tier subsidy is ~$X per user per month.”
> 

> ⚠️ **“$6K MRR” note:** The rounded “$6K” is used in pitch narrative; dashboard-verified figure is ~$5,820. This is ~3% rounding — acceptable for pitch, but use $5.8K in any detailed financial discussion.
> 

---

### 7.2 Future Model

### Key Questions

- **What additional revenue streams are planned?**
    
    A monetization toolbox for creators:
    
    - Display ads integration
    - Digital goods (payment in Pollen)
    - 1-click buy Pollen (in-app top-ups)
    - Subscription plans for AI credits
    — everything a creator needs to turn their app into a business, without touching infrastructure.
- **Shift from *developer pays* → *end user pays*, developer gets a share?**
    
    Exactly the plan. Today creators buy and resell, which proves demand but leaves money on the table for everyone. Future: end users pay directly inside creator apps, creators earn a share of revenue, and we take a cut. Creators focus on building, we handle the rest.
    
- **Upsells, marketplace, enterprise licenses?**
    
    The app discovery marketplace is strategic — it’s where end users will discover AI experiences they didn’t know they needed, and where creators get real-time signal on what works. No enterprise licensing; everyone uses the same platform, like YouTube.
    
- **How does revenue scale with usage?**
    
    Revenue grows with both creators and users — and they amplify each other. More creators means more apps, more apps attract more users, more users attract more creators. If the creator side goes exponential, the user side goes vertical.
    
- **How defensible is monetization long-term?**
    
    Two-sided network effects: creators build where the users are, users go where the apps are. The discovery marketplace makes this stickier — creators see what works, users find what they want, and switching costs grow as both sides invest in the ecosystem.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Projected gross margin post-beta | ❌ Financial model needed | — |
| Breakeven date | ❌ Financial model needed | — |
| Revenue forecasts (12–36 months) | ❌ Financial model needed | — |

---

## 8. Traction — What proof do you have?

### Key Questions

- **What are your strongest traction signals?**
    
    3M+ end-users/month across creator-built apps. 9,500+ unique apps (14d). ~600 new signups/day (~100 devs + ~500 end users). 17K+ Discord members. 4K+ GitHub stars. ~$5.8K/month revenue, 213 users converted to paying within 30 days. All organic discovery — no paid marketing. Free daily credits are the acquisition lever (freemium model).
    
- **How fast are you growing?**
    
    ~600 new signups every day. Social media, network effects, open-source traction — the 9,500+ existing apps all bring new users to Pollinations.
    
    ⚠️ *Need screenshots or tracking of mentions/recommendations across channels.*
    
- **Any lighthouse customers or case studies?**
    
    One creator-built Roblox game — 51M visits, $12K/month in user spend. Pictify — creative tool with live paid credits model. PolliVision — video generator implementing Pollen credit system.
    
    ⚠️ *Need screenshots and size/user numbers for case studies. Need comparison benchmarks to show Discord/GitHub numbers are strong.*
    
- **Which milestones have you achieved?**
    
    Unified API across 14 providers. Pollen credit system working. Auth system (OAuth 2.1 + OpenID Connect). Community handles its own onboarding and support.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Weekly revenue trend | $335 → $250 → $325 → $415 → $1,185 → $820 → $690 → $745 → $860 → $1,630 → $1,355 → $295 (partial) | kpi.myceli.ai |
| Pack purchases (week 02-09) | 123 | kpi.myceli.ai |
| Users converted to Pack (30d) | 213 | Economics Dashboard |
| Paying developers by tier | 183 total (Microbe: 1, Spore: 44, Seed: 67, Flower: 56, Nectar: 15) | Economics Dashboard |
| DAU / MAU ratio | ❌ Not yet tracked | — |
| Retention cohorts (30/60/90d) | ❌ Not available | — |
| MoM / QoQ revenue growth | ❌ Needs longer time range | — |

> ⚠️ **“300+ paying end users” note:** The pitch deck cites 300+. Dashboard shows 183 paying developers by tier and 213 converted within 30 days. The 300+ figure may count differently (e.g., including one-time purchasers). Clarify the counting methodology before using in pitch — use 213 (30d conversions) as the conservative, verifiable number.
> 

---

## 9. Go-To-Market — How do users find you?

### Key Questions

- **Which acquisition channels work today?**
    
    GitHub (stars, README links, word of mouth between creators), Discord community, and direct API discovery. 100% organic discovery — ~600 new signups per day finding us through search, repos, and peer recommendations. Free daily credits serve as our acquisition cost (standard freemium land-and-expand). AI models recommend us — ChatGPT and Claude suggest Pollinations when people ask about AI APIs. We rank well for relevant search queries.
    
    ⚠️ *Need screenshots or tracking of mentions/recommendations across channels.*
    
- **How does organic growth happen?**
    
    Free compute is the hook — every creator gets a daily Pollen grant, zero barrier to start. Dev finds us → builds something → shares on GitHub/Discord/YouTube/Reddit → other devs see it → they build too. Most apps are open source — each app is also a template. Someone forks catgpt and makes pokemongpt. One app becomes ten. End users discover the platform through creator apps → some become creators themselves.
    
- **Role of community and content?**
    
    Discord community onboards new devs, shares starter kits, answers questions in many languages. We don’t run a support team — the community handles it. Community members contribute code, which deepens engagement and retention. Both support layer and growth engine — creators help each other, share projects, pull in new creators.
    
- **Partnerships or integrations?**
    
    Cloud provider partnerships (ByteDance/Volcengine, Azure, OVH, Alibaba) for compute. Model provider integrations (14 providers, 38+ models) make Pollinations the easiest single entry point. Works inside ChatGPT, Claude, OpenClaw and other AI assistants. No formal distribution partnerships yet — that’s a post-seed play once the marketplace is live.
    
- **How does acquisition scale?**
    
    Two phases. First: bootstrap off organic reach through GitHub and existing networks. Each app brings its own users, and because they’re open source, each app is also a template for the next one — the model already works without a perfect app store.
    
    Second: supply side (creators) — community manager hire → structured open-source flywheel → more contributors → more apps → more organic discovery. Demand side (end users) — app marketplace with SEO, cross-app discovery, and content marketing. The marketplace is the missing piece — once end users can browse and find AI apps, the two-sided loop kicks in and growth compounds.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Paid marketing spend | $0 | — |
| Free-tier cost (acquisition lever) | ~$3/mo per end user, more for devs | Derived |
| Signups → Activated (D7) | 5.8% | Economics Dashboard |
| Tier-to-Pack conversion (7d) | 0.92% | Economics Dashboard |
| Activation → Purchase | 76% (week 02-09) | Economics Dashboard |
| Viral coefficient | ❌ Not tracked | — |
| Community-driven growth (%) | ❌ Not in dashboards | — |
| GitHub / Roblox referrals | Visible in raw events, not aggregated | Raw Tinybird |

---

## 10. Competition & Differentiation — Why do you win?

### Key Questions

- **Who are your direct and indirect competitors?**
    
    Direct: nobody combines compute, distribution, and creator payouts in one layer yet. We’re building a category, not competing in an existing one.
    
    Indirect:
    
    - fal.ai ($4.5B) — enterprise API for image/video AI models. Charges the developer.
    - OpenRouter ($100M ARR, ~8 people) — aggregates LLM APIs into one endpoint. Charges the developer.
    - Replicate (acquired by Cloudflare Nov 2025) — run open-source AI models via API. Charges the developer.
    - Together.ai — enterprise-grade AI inference. Charges the developer.
    - HuggingFace — model hub + hosting. More a library than a platform.
    - Vercel/Netlify — app hosting (no AI compute or monetization).
    
    Each solves a piece — none solve the whole. Not in the “YouTube of AI” sense.
    
- **Why do users choose you over alternatives?**
    
    Free to start, no infrastructure to manage, multi-model access from day one. No signup needed — works from a URL. Daily credits — build a real app before spending anything. Once revenue share launches — the only platform where creators can get paid without building their own billing stack. For end users: one wallet that works across every app. Community that actually helps.
    
- **How hard are you to copy (moat / entry barriers)?**
    
    The tech is replicable. The two-sided network isn’t. Every creator with an audience and Pollen earnings on the platform makes it harder for a competitor to pull them away. Infrastructure players would have to build the entire monetization and discovery layer from scratch — and they’d start with zero creators and zero users.
    
    Backing it up: years of infrastructure work — unified API across 14 providers, model routing, fallbacks, billing, OAuth. Works inside ChatGPT, Claude, and other AI assistants. API and pricing shaped by constant community feedback. 9,500+ unique apps — switching means breaking real products.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Competitive feature comparison | ❌ Needs pitch deck matrix | — |
| Switching costs | ❌ Qualitative | — |
| Qualitative differentiation signals | ❌ Needs collection | — |

---

## 11. Team — Why this team?

### Key Questions

- **Why is this team uniquely qualified?**
    
    Two founders, zero marketing spend, ~1.14M daily requests, ~$5.8K MRR. Both are AI-native operators — using AI assistance across coding, operations, strategy, and content at a level that multiplies their output far beyond what a two-person team should be capable of. The open-source community actively contributes code — shipping features, fixes, and integrations. The community is the engineering team, and it scales in ways headcount never will.
    
- **Relevant technical, AI, or developer experience?**
    
    Thomas: AI & CS degree (Edinburgh, top of class), published neural network researcher, Amazon engineer, 15+ years in AI and creative communities, 9 years running art/tech communities in Brazil. Elliot: operations, financial modeling, cloud partnerships (ByteDance, Azure, OVH, Alibaba), payment infra across 195 countries. Advisors: Kalam Ali and Susanne Kreimer (both active in fundraising).
    
- **What key hires are missing?**
    
    Growth lead and backend/MLOps engineer already ramping. Priority seed hire: Community Manager — turn organic code contributions into a structured open-source flywheel. Then additional backend engineers and remaining roles per hiring plan.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Team size | 2 founders | — |
| Daily requests per team member | ~570K/day | Derived |
| MRR per team member | ~$2,910/month | Derived |
| Total daily requests | ~1.14M | Platform Load |
| Registered users | 29,700 | Tier Costs |
| Unique apps (14d) | 9,500 | API Key Usage |
| Providers managed | 14 | Provider Costs |
| Revenue per day | $194 | Daily Spending |
| Open-source community code contributions | ❌ Needs tracking | — |

---

## 12. Roadmap & Milestones — What’s next?

### Key Questions

- **What are the next 12–24 months?**
    
    Exit beta (Feb 2026), close $2.5M seed (early May 2026, cash lands June 1), hire full team, launch revenue share and monetization toolbox, build app discovery marketplace. Year two: scale to 77K paying users and $271K/month net cash flow.
    
- **Which milestones unlock the most growth?**
    
    Revenue share (creators finally get paid — unlocks creator retention), app discovery marketplace (end users find apps — unlocks demand side), and in-app payment widgets (money flows through us, not around us).
    
- **Key dependencies?**
    
    Closing the seed round by early May — cash runs out at current burn. Post-fundraise, the 5-month funnel ramp depends on hiring speed and getting the monetization toolbox live.
    
- **Biggest execution risks?**
    
    App monetization rate (will 10% of apps actually generate revenue?), timing the seed close before runway ends, and building the discovery layer fast enough to unlock end-user demand.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| **Daily P&L** |  |  |
| Revenue | $194/day (~$5.8K/month) | Daily Spending |
| Paid infrastructure | −$215/day | Daily Spending |
| Paid inference | −$460/day | Daily Spending |
| Paid GPU | −$125/day | Daily Spending |
| Free inference | −$313/day | Daily Spending |
| Free GPU | −$87/day | Daily Spending |
| **Net burn** | **−$606/day (~$18.2K/month)** | Daily Spending |
| **Provider costs (14d)** |  |  |
| Google | $3,710 (26%) | Provider Costs |
| Azure-2 | $1,910 (13%) | Provider Costs |
| io.net | $1,870 (13%) | Provider Costs |
| Fireworks | $1,670 (12%) | Provider Costs |
| Modal | $1,310 (9%) | Provider Costs |
| Azure | $1,040 (7%) | Provider Costs |
| ByteDance | $983 (7%) | Provider Costs |
| AWS | $630 (4%) | Provider Costs |
| Alibaba | $513 (4%) | Provider Costs |
| ElevenLabs | $367 (3%) | Provider Costs |
| Airforce | $349 (2%) | Provider Costs |
| OVHcloud | $84 (1%) | Provider Costs |
| Perplexity | $34 (<1%) | Provider Costs |
| Scaleway | $13 (<1%) | Provider Costs |
| **Total provider costs (14d)** | **$14,500** | Provider Costs |
| **Projections** |  |  |
| Projected monthly tier cost (30d) | $23,800 | Tier Costs |
| Growth-adjusted 90d projection | $71,400 | Tier Costs |
| Breakeven target date | ❌ Financial model needed | — |
| Projected paying users at breakeven | ❌ Financial model needed | — |
| Months from seed close to first rev-share payout | ❌ Roadmap doc needed | — |
| Runway (depends on cash position) | ❌ Not in dashboards | — |

---

## 13. Fundraising — What do you need?

### Key Questions

- **How much capital are you raising?**
    
    €2.5M / $2.5M seed round.
    
    ⚠️ *Need to align on single currency before deck goes out.*
    
- **What will the money be used for?**
    
    Full team (8 roles, ~$1M/year), heavy investment in compute to fuel creator grants and scale with demand, monetization toolbox development, and app discovery marketplace.
    
    Rough split: ~50% Compute & Infrastructure, ~30% Engineering, ~20% Community.
    
- **Which milestones will this round unlock?**
    
    23K+ paying users, revenue share live, app marketplace launched — proving the full creator monetization loop works at scale.
    
- **When is the next raise planned?**
    
    Series A when the compute loop is proven and we’re ready to layer on digital goods marketplace — likely 18–24 months post-seed, from a position of profitability.
    

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Round size | €2.5M / $2.5M | Pitch deck |
| Use of funds | ~50% compute, ~30% engineering, ~20% community | Pitch deck |
| Runway extension | ❌ Financial model needed | — |
| Valuation logic | ❌ Financial model needed | — |
| Series A trigger conditions | ❌ Pitch deck needed | — |

---

## 14. Additional Slides (likely not in the send-out deck)

### Community & Open Source — Why this is a moat

---

### 14.1 Community Philosophy

### Key Questions

- Why is community central to the platform?
- How are users also contributors and co-creators?
- What problems does community solve beyond product features?

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Discord members | 17K+ | External |
| GitHub stars | 4K+ | External |
| Active vs. passive members | ❌ Not tracked | — |
| Community-driven feature ideas | ❌ Not tracked | — |

---

### 14.2 Open Source Strategy

### Key Questions

- Which parts of Pollinations are open source and why?
- How does open source lower adoption barriers?
- How does it build trust in AI?
- Why is open source an enabler, not a risk, for the business?

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Open-source repositories | ❌ Needs count | — |
| GitHub stars | 4K+ | External |
| GitHub forks | ❌ Needs count | — |
| External contributors | ❌ Not tracked | — |
| Contributions per month | ❌ Not tracked | — |
| Time to first contribution | ❌ Not tracked | — |

---

### 14.3 Community × Open Source Flywheel

### Key Questions

- How do community and open source reinforce each other?
- How do users become contributors and evangelists?
- Why is this flywheel hard to replicate?
- How does it improve product quality and speed?

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| User → contributor conversion | ❌ Not tracked | — |
| Contributor retention | ❌ Not tracked | — |
| Community-led features | ❌ Not tracked | — |
| PRs per month | ❌ Not tracked | — |
| Organic growth rate | 100% organic | External |

---

### 14.4 Economic Impact of Community & Open Source

### Key Questions

- How do community and open source reduce costs?
- How do they lower CAC and increase LTV?
- What network effects emerge?

### Relevant KPIs / Proof Points

| KPI | Value | Source |
| --- | --- | --- |
| Support cost reduction | $0 support team (community handles it) | — |
| Paid marketing CAC | $0 | — |
| Free-tier CAC (cost of acquisition) | ~$3/mo per end user | Derived |
| LTV uplift for community users | ❌ Not available | — |
| Organic vs. paid growth rate | 100% organic | External |

---

## Next Steps

### Data & Metrics Fixes

- **~~Fix “600+ devs/day” metric~~** ✅ Corrected to “~600 new signups/day (~100 devs + ~500 end users)” throughout.
- **~~Fix model/provider counts~~** ✅ Corrected to 38+ models / 14 providers throughout.
- **~~Fix app count~~** ✅ Corrected to 9,500+ unique apps (14d) throughout.
- **~~Fix daily requests~~** ✅ Corrected to ~1.14M throughout.
- **Clarify “300+ paying” figure** — dashboard shows 183 paying devs by tier, 213 converted in 30d. Align counting methodology.
- **Verify Roblox spending benchmark** — Thomas found 50–90% during the call; needs a solid source before putting in deck.
- **Align round currency** — €2.5M vs $2.5M; pick one for the deck.

### Missing Data (Needs Work)

- **Retention data** — 30/60/90 day cohorts needed.
- **Revenue trajectory** — MoM growth trend visualization.
- **Unit economics** — cost to serve free vs. paid user, LTV:CAC, path to breakeven.
- **DAU/MAU ratio** — not currently tracked.
- **ARPU per segment** — not directly available from dashboards.

### Pitch Preparation

- **Source all market claims** — TAM/SAM/SOM figures, AI infrastructure CAGR (30%+), creator economy CAGR (20%+).
- **Screenshots/evidence** — AI assistant mentions, Discord community examples, GitHub traction, case study details (Roblox game user numbers, Discord/GitHub comparables).
- **Pollen legal one-pager** — frame as credit points not currency; prepare devil’s advocate questions for VCs.
- **Prepare Outlier Ventures answer** — VCs will find it on Google; need a clean 2-sentence explanation.
- **Monetization toolbox roadmap** — detailed list defining the product roadmap.
- **App segment classification** — align on MECE structure for ongoing tracking.
- **Live demo for VC pitches** — confirmed as doable. Option A: VC suggests app idea, build it live. Option B: pre-build based on VC’s known interests.

---

## Appendix: KPI Quick Reference (Dashboard-Verified, Feb 3–17 2026)

| Category | KPI | Value |
| --- | --- | --- |
| **Users** | Registered | 29,700 |
|  | Active (all-time) | 14,415 |
|  | Unique (14d) | 9,297 |
|  | New signups/day | ~600 |
|  | MAU (end users) | ~3M |
| **Apps** | Unique apps (14d) | 9,500 |
|  | BYOP apps (14d) | 237 |
| **Revenue** | Daily revenue | $194 |
|  | MRR | ~$5,820 |
|  | ARR | ~$69,840 |
|  | Pack revenue (14d) | $3,120 |
|  | Free tier cost (14d) | $11,100 |
|  | Total Pollen consumed (14d) | $14,100 |
| **Costs** | Daily net burn | −$606 |
|  | Monthly burn | ~$18,200 |
|  | Provider costs (14d) | $14,500 |
| **Conversion** | Signups → Activated (D7) | 5.8% |
|  | Tier-to-Pack (7d) | 0.92% |
|  | Activation → Purchase | 76% |
|  | Converted users (30d) | 213 |
| **Platform** | Daily requests | ~1.14M |
|  | Avg RPM | 1,100 |
|  | Peak RPM | 3,300 |
|  | Models | 38+ |
|  | Providers | 14 |
|  | Modalities | 5 |
| **Community** | Discord | 17K+ |
|  | GitHub stars | 4K+ |
| **Team** | Founders | 2 |
|  | MRR/founder | ~$2,910 |

---