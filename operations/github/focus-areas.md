# Focus areas

The focus wall groups every issue and pull request into one of 18 areas. It shows where the team's work goes and whether that matches what we said we would focus on.

## How to assign an area

- Pick **one** area per issue or PR: the area the change is mainly *for*.
- Judge a PR by what it does and which files it changes, not by its title prefix alone.
- When a change touches several areas, pick the one its reviewer would need to understand it.
- PRs that only promote or sync `main` into `production` get no area. They carry other PRs' work and are counted separately as release overhead.

## Overview

| Area | In one line |
|---|---|
| [Models](#models) | Which models we serve, through which providers, at what price |
| [Community models](#community-models) | Models and agents published by the community |
| [Agents & agent tools](#agents--agent-tools) | Agents we host and the tools agents use |
| [Developer tools](#developer-tools) | SDK, CLI, MCP package and third-party integrations |
| [Accounts & keys](#accounts--keys) | Sign-in, API keys, permissions and abuse handling |
| [Payments & earnings](#payments--earnings) | Money in (packs, top-ups) and money out (creator payouts) |
| [Quests & rewards](#quests--rewards) | Quests, censuses, referrals and their Pollen rewards |
| [Dashboard](#dashboard) | Shared Enter dashboard UI and `@pollinations/ui` |
| [API & reliability](#api--reliability) | How generation requests are handled, and keeping them up |
| [Metering & billing](#metering--billing) | Charging the right amount for each request |
| [CI & releases](#ci--releases) | Tests, CI, deployments and secret syncs |
| [Internal automation](#internal-automation) | Bots and agent guidance that run the repo for us |
| [Website](#website) | The public pollinations.ai site and brand assets |
| [Docs & support](#docs--support) | API docs, guides, README and helping users |
| [App catalog & showcase](#app-catalog--showcase) | Community apps listed on our site |
| [Social & news](#social--news) | News posts and social media pipelines |
| [Data pipelines](#data-pipelines) | Getting data into Tinybird |
| [Insights](#insights) | KPIs, funnels, revenue and costs we read from that data |

## Areas

### Models

Which models we offer, how they are routed to providers, and what they cost.

**Covers**
- Adding, updating, renaming and retiring models (`shared/registry/`, `gen.pollinations.ai/src/text/configs/`)
- Provider routing and fallbacks
- Model prices and pricing alignment with provider costs
- GPU workers that serve our own models (`operations/infrastructure/gpu/`)
- Problems with one model's output or availability

**Not here**
- Community-published models → [Community models](#community-models)
- A request charged the wrong amount → [Metering & billing](#metering--billing)

**Examples:** #15457 enable Azure GPT-6 · #15814 add Azure TTS models · #15413 bill MiniMax H3 Max Turbo at fal list rates

### Community models

Models, agents and MCP servers that community members publish on Pollinations, and the checks that keep them healthy.

**Covers**
- Publisher access: who may publish, allowlists, publisher triage
- The community model catalog and how it is listed
- The community monitor (`operations/community-monitor/`) and its alerts to owners
- Moving Quest models to community hosting

**Not here**
- Models we run ourselves → [Models](#models)
- Payouts to publishers → [Payments & earnings](#payments--earnings)

**Examples:** #15343 allow Saauf to publish community models · #15378 update community publisher access · #14983 community monitor relist and served-model notices

### Agents & agent tools

Agents as a product, and the tools agents use to get work done.

**Covers**
- Hosted agents and prompt agents
- Agent harnesses (Claude Code, Hermes, Codex) and their defaults
- The agent computer: shell, git, sandboxes and VMs
- Hosted MCP servers in `apps/` (FFmpeg, Ask Jev, Composio, Exa)
- Client tools that agents can call

**Not here**
- The `@pollinations/mcp` package developers install → [Developer tools](#developer-tools)
- Bots that run our own repo → [Internal automation](#internal-automation)

**Examples:** #15655 let prompt agents call client tools · #15546 keep binary bytes intact in the computer shell · #15887 default harnesses to GPT-6 Sol

### Developer tools

What developers install or plug in to build on Pollinations.

**Covers**
- SDK (`packages/sdk/`), CLI (`packages/polli-cli/`), MCP package (`packages/mcp/`), n8n node
- Integrations with other tools: Krita, GIMP, Godot, Obsidian, Figma, Vercel AI SDK
- BYOP device flow for integrators

**Not here**
- Guides on how to use them → [Docs & support](#docs--support)

**Examples:** #15917 SDK speech inputs and audioTransform · #15877 CLI staging environment · #15578 Krita image generation with BYOP

### Accounts & keys

Who a user is, what their keys can do, and stopping abuse.

**Covers**
- Sign-in (GitHub, Google), OAuth and account linking
- API keys, child keys, expiries and key permissions
- Account management and settings logic
- Fraud, abuse, bans and allowlists

**Not here**
- Who may publish community models → [Community models](#community-models)
- Payment fraud at checkout → [Payments & earnings](#payments--earnings)

**Examples:** #15450 let child keys create keys · #15159 stop sending "undefined" as client_id

### Payments & earnings

Money moving in and out: users buying Pollen, and creators getting paid.

**Covers**
- Stripe checkout, packs, top-ups and auto top-up
- Wallet and balances (Quest Pollen and paid balance)
- Payment methods: cards, crypto, x402, stablecoins
- Refunds and checkout fraud
- Creator earnings and developer cash-out

**Not here**
- Debiting a single request → [Metering & billing](#metering--billing)
- Revenue reporting → [Insights](#insights)

**Examples:** #15700 auto top-up double credit fix · #15485 disable auto top-up after a decline · #14740 top-up pages linked from 402 notices

### Quests & rewards

Ways users earn Pollen by doing something for us.

**Covers**
- Quests and quest payouts
- Bee Census and Honey Census surveys
- Referral rewards
- Linking app submissions and issue reports to quests

**Not here**
- Buying Pollen → [Payments & earnings](#payments--earnings)

**Examples:** #15934 Honey Census for Pollen buyers · #15809 pay only for written census answers · #15566 let an approved app submission close and pay a quest

### Dashboard

Shared UI in the Enter dashboard (`enter.pollinations.ai/frontend/`) and the `@pollinations/ui` package.

**Covers**
- Dashboard layout, navigation, loading states and redesigns
- Shared components in `packages/ui/`
- Dashboard pages not owned by one area, such as the model list

**Not here**
- A screen owned by one area goes to that area. For example, the key editor → [Accounts & keys](#accounts--keys), the top-up page → [Payments & earnings](#payments--earnings)

**Examples:** #15558 flat design for the Enter dashboard · #15907 shared UI changes from website v2 · #14940 show healthy models by default

### API & reliability

How generation requests flow through `gen.pollinations.ai` and `enter.pollinations.ai`, and keeping that path up.

**Covers**
- API endpoints and their behaviour, including OpenAI- and Anthropic-compatible routes
- Request handling, streaming, errors and timeouts
- The generation coordinator, caching, R2, D1 and KV
- Service health: logs, alerts, model monitor, observability (`operations/model-monitor/`, `operations/observability/`)

**Not here**
- One model misbehaving → [Models](#models)
- Community model monitoring → [Community models](#community-models)

**Examples:** #15680 add Anthropic Messages API at /v1/messages · #14999 keep the code and message of every terminal stream error · #15283 classify provider rejections

### Metering & billing

Charging each request the right amount, based on the usage the provider reports.

**Covers**
- Usage parsing and per-request debits
- Billing for fallbacks, streams and failed generations
- Billing event correctness

**Not here**
- Setting a model's price → [Models](#models)
- Wallets and top-ups → [Payments & earnings](#payments--earnings)

**Examples:** #15996 bill the flux.2-max fallback from the image it returns · #15454 bill the z-image fal fallback from billed megapixels · #14606 preserve stream usage across cost-only updates

### CI & releases

Getting code tested and shipped safely.

**Covers**
- GitHub Actions, PR checks and test infrastructure
- Deployment workflows and repo tooling
- Repo-wide dependency upgrades
- Secret syncs and key provisioning
- Package publishing (npm)

**Not here**
- Promotion PRs (`main` → `production`): no area, counted as release overhead
- An upgrade for one app → that app's area, such as the website's React 19 upgrade → [Website](#website)

**Examples:** #14324 speed up pull request checks · #14598 migrate GitHub Actions off Node 20 · #14596 publish SDK through npm OIDC

### Internal automation

Bots and agents that run the repository and community work for us.

**Covers**
- Issue and PR classifier and labelling (`operations/github/`)
- Polli auto-fix agent
- Operations agents and scheduled repo jobs
- Agent guidance: `AGENTS.md`, `CLAUDE.md`, `.claude/skills/`

**Not here**
- Agents users can run → [Agents & agent tools](#agents--agent-tools)
- What the news bots post → [Social & news](#social--news)

**Examples:** #15590 let the classifier label every new issue and PR · #14974 never let bots trigger the Polli auto-fix agent

### Website

The public site at pollinations.ai (`pollinations.ai/`).

**Covers**
- Home, Apps, legal and marketing pages
- Website framework and dependency upgrades
- Brand assets: logo, art, brand kit

**Not here**
- The Enter dashboard → [Dashboard](#dashboard)
- Which apps are listed → [App catalog & showcase](#app-catalog--showcase)

**Examples:** #15983 new shell, home and legal pages · #15997 new Apps page · #15846 one smooth lotus everywhere

### Docs & support

Helping developers and users use Pollinations.

**Covers**
- API reference sources (OpenAPI schemas and descriptions) and APIDOCS regeneration
- Guides, README and docs for AI assistants
- Support flows: priority support, help content and issue intake

**Not here**
- Agent guidance for our own repo → [Internal automation](#internal-automation)

**Examples:** #15532 Vercel AI SDK guide · #15965 correct the BYOP device-flow guide · #14964 MCP servers and prompt-agent tips in the agent guide

### App catalog & showcase

Community apps built on Pollinations, and how we show them.

**Covers**
- App submissions and review (`operations/app-management/`)
- Catalog entries, app metrics, screenshots, ranking and pruning
- The showcase and a "Made with Pollinations" badge

**Not here**
- Apps we maintain in `apps/` → the area they serve, such as hosted MCP servers → [Agents & agent tools](#agents--agent-tools)

**Examples:** #15919 rank listed apps in app_top_weekly · #15695 remove unavailable community apps · #15694 backfill app screenshots

### Social & news

What we publish about Pollinations, and the pipelines that publish it (`operations/social/`).

**Covers**
- Daily, weekly and monthly news
- Discord, Reddit, LinkedIn and X posts
- Newsletter

**Examples:** #14448 restore weekly publishing and add monthly news · #15859 don't announce merged PRs before the production release

### Data pipelines

Getting data into Tinybird correctly (`enter.pollinations.ai/observability/`).

**Covers**
- Datasources, pipes and the generation event schema
- Traffic syncs: GitHub, Cloudflare, Search Console
- Product event recording: page views, sign-in sources

**Not here**
- Dashboards and KPIs built on the data → [Insights](#insights)

**Examples:** #15823 dedicated Cloudflare token for traffic sync · #15155 stop rejecting page-view beacons with 415 · #15180 attribute sign-ins to the real URL

### Insights

What we read from the data to run the business (`operations/kpi/`, `operations/economics/`).

**Covers**
- KPIs and growth metrics
- Funnels: sign-in, signup, conversion
- Revenue, provider costs, invoices and the economics ledger
- Analysis of user research, such as census answers

**Not here**
- Collecting the raw data → [Data pipelines](#data-pipelines)

**Examples:** #15778 weekly GitHub star growth KPI · #15170 split sign-in loss into GitHub's side and ours · #14471 reconcile revenue, forecasts and ledger evidence

---

## Boundary rules

| When it's unclear between… | Rule |
|---|---|
| Models · Metering & billing | A model's price or route → Models. A request charged the wrong amount → Metering & billing |
| Models · Community models | We run it → Models. A community member publishes it → Community models |
| Agents & agent tools · Developer tools | Runs as an agent or hosted MCP server → Agents. Installed by a developer (SDK, CLI, MCP package, plugin) → Developer tools |
| Dashboard · any area | A screen owned by one area → that area. Shared or cross-cutting UI → Dashboard |
| Payments & earnings · Metering & billing | Wallet, checkout, payouts → Payments. Debiting a single request → Metering |
| Data pipelines · Insights | Getting data in → Data pipelines. Reading or reporting on it → Insights |
| Agents & agent tools · Internal automation | Users run it → Agents. It runs our repo or community → Internal automation |
| CI & releases · any area | Secret or key sync → CI & releases, unless the PR is mainly about a feature (the x402 key → Payments) |
