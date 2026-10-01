# Focus areas

The focus wall groups every issue and pull request into one of 15 areas. It shows where the team's work goes and whether that matches what we said we would focus on.

## How to assign an area

- Pick **one** area per issue or PR: the area the change is mainly *for*.
- Judge a PR by what it does and which files it changes, not by its title prefix alone.
- When a change touches several areas, pick the one its reviewer would need to understand it.
- Where a PR came from does not decide its area. A PR that completes a quest goes to the area of the code it changes; the `POLLEN-QUEST` label is never a reason to pick Quests & rewards.
- PRs that only promote, sync or deploy `main` into `production` (titled "Promote…", "Sync…" or "Deploy…") get no area. They carry other PRs' work and are counted separately as release overhead.
- Automated PRs from the Pollinations bot (API docs regeneration, app metrics, README refreshes) get the area of what they refresh, but are left out when measuring effort.

## Overview

| Area | In one line |
|---|---|
| [Models](#models) | Which models we serve, through which providers, at what price |
| [Community models](#community-models) | Models, agents and MCP servers published by the community |
| [Agents & agent tools](#agents--agent-tools) | Agents we host and the tools agents use |
| [Developer tools](#developer-tools) | SDK, CLI, MCP package and plugins for other tools |
| [Accounts & keys](#accounts--keys) | Sign-in, API keys, permissions and abuse handling |
| [Billing & payments](#billing--payments) | What each request costs, and money in and out |
| [Quests & rewards](#quests--rewards) | Quests, censuses, referrals and their Pollen rewards |
| [Dashboard](#dashboard) | Shared Enter dashboard UI and `@pollinations/ui` |
| [API & reliability](#api--reliability) | How generation requests are handled, and keeping them up |
| [CI & releases](#ci--releases) | Tests, CI, deployments and secret syncs |
| [Internal automation](#internal-automation) | Bots, internal agents and agent guidance that run our work |
| [Brand & news](#brand--news) | The public site, brand, news, social posts and announcements |
| [Docs & support](#docs--support) | API docs, guides, README and helping users |
| [App catalog & showcase](#app-catalog--showcase) | Apps users submit, and apps we maintain for people to use or copy |
| [Data & insights](#data--insights) | Getting data into Tinybird and what we learn from it |

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
- A request charged the wrong amount → [Billing & payments](#billing--payments)

**Examples:** #15457 enable Azure GPT-6 · #15814 add Azure TTS models · #15413 bill MiniMax H3 Max Turbo at fal list rates

### Community models

Models, agents and MCP servers that community members publish on Pollinations, and the checks that keep them healthy.

**Covers**
- Publisher access: who may publish, the publisher allowlist ("Add X to the list" PRs), publisher triage
- The community model catalog and how it is listed
- The community monitor (`operations/community-monitor/`) and its alerts to owners
- Moving Quest models to community hosting
- Community agents kept in `apps/agent-*` (quest submissions published as `community/<user>/<name>`)

**Not here**
- Models we run ourselves → [Models](#models)
- Payouts to publishers → [Billing & payments](#billing--payments)

**Examples:** #15343 allow Saauf to publish community models · #15378 update community publisher access · #14983 community monitor relist and served-model notices

### Agents & agent tools

Agents as a product, and the tools agents use to get work done.

**Covers**
- Agents we host for users, such as Floret (`apps/floret/`), the generative media agent we sell media through, and prompt agents
- Agent harnesses (Claude Code, Hermes, Codex) and their defaults
- The agent computer: shell, git, sandboxes and VMs
- Hosted MCP servers in `apps/` (computer, FFmpeg, Exa, Composio, Ask Jev)
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
- Example and template apps → [App catalog & showcase](#app-catalog--showcase)

**Examples:** #15917 SDK speech inputs and audioTransform · #15877 CLI staging environment · #15578 Krita image generation with BYOP

### Accounts & keys

Who a user is, what their keys can do, and stopping abuse.

**Covers**
- Sign-in (GitHub, Google), OAuth and account linking
- API keys, child keys, expiries and key permissions, including which models a key may use
- Account management and settings logic
- Fraud, abuse and bans

**Not here**
- Who may publish community models → [Community models](#community-models)
- Payment fraud at checkout → [Billing & payments](#billing--payments)

**Examples:** #15450 let child keys create keys · #15159 stop sending "undefined" as client_id

### Billing & payments

Everything about money: what each request is charged, and money moving in and out.

**Covers**
- Per-request billing: usage parsing, debits, billing for fallbacks, streams and failed generations, billing event correctness
- Stripe checkout, packs, top-ups and auto top-up
- Wallet and balances (Quest Pollen and paid balance)
- Payment methods: cards, crypto, x402, stablecoins
- Refunds and checkout fraud
- Creator earnings and developer cash-out

**Not here**
- Setting a model's price → [Models](#models)
- Revenue reporting → [Data & insights](#data--insights)

**Examples:** #15996 bill the flux.2-max fallback from the image it returns · #15700 auto top-up double credit fix · #15485 disable auto top-up after a decline

### Quests & rewards

Ways users earn Pollen by doing something for us.

**Covers**
- The quest system itself: quest rules, rewards and payouts
- Bee Census and Honey Census surveys
- Referral rewards
- Linking app submissions and issue reports to quests

**Not here**
- Buying Pollen → [Billing & payments](#billing--payments)
- Work done to complete a quest → the area of the code it changes, such as a community agent → [Community models](#community-models)

**Examples:** #15934 Honey Census for Pollen buyers · #15809 pay only for written census answers · #15566 let an approved app submission close and pay a quest

### Dashboard

Shared UI in the Enter dashboard (`enter.pollinations.ai/frontend/`) and the `@pollinations/ui` package.

**Covers**
- Dashboard layout, navigation, loading states and redesigns
- The banner and notice components themselves (what a banner says → [Brand & news](#brand--news))
- Shared components in `packages/ui/`
- Dashboard pages not owned by one area, such as the model list

**Not here**
- A screen owned by one area goes to that area. For example, the key editor → [Accounts & keys](#accounts--keys), the top-up page → [Billing & payments](#billing--payments)

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
- An upgrade for one app → that app's area, such as the website's React 19 upgrade → [Brand & news](#brand--news)

**Examples:** #14324 speed up pull request checks · #14598 migrate GitHub Actions off Node 20 · #14596 publish SDK through npm OIDC

### Internal automation

Bots and agents that run the repository and community work for us.

**Covers**
- Issue and PR classifier and labelling (`operations/github/`)
- Internal agents: Polli (`apps/polli/`), Flow, and the Polli auto-fix agent
- Operations agents and scheduled repo jobs
- Agent guidance: `AGENTS.md`, `CLAUDE.md`, `.claude/skills/`

**Not here**
- Agents users can run → [Agents & agent tools](#agents--agent-tools)
- What the news bots post → [Brand & news](#brand--news)

**Examples:** #15590 let the classifier label every new issue and PR · #14974 never let bots trigger the Polli auto-fix agent

### Brand & news

How we present Pollinations and what we tell people: the site at pollinations.ai (`pollinations.ai/`), the brand, and what we post or announce (`operations/social/`).

**Covers**
- Home, Apps, legal and marketing pages
- Website framework and dependency upgrades
- Brand assets: logo, art, brand kit
- Daily, weekly and monthly news, and the pipelines that publish it
- Discord, Reddit, LinkedIn and X posts
- Newsletter
- Announcements, notices and banners shown in the dashboard or on the site: their wording, adding and removing them

**Not here**
- The Enter dashboard → [Dashboard](#dashboard)
- Which apps are listed → [App catalog & showcase](#app-catalog--showcase)

**Examples:** #15983 new shell, home and legal pages · #15846 one smooth lotus everywhere · #14448 restore weekly publishing and add monthly news

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

Apps built on Pollinations: the ones users submit and we list, and the ones we maintain for people to use or copy.

**Covers**
- App submissions and review (`operations/app-management/`)
- Catalog entries, app metrics, screenshots, ranking and pruning
- The "Made with Pollinations" badge
- Template and example apps we maintain in `apps/` (CatGPT, AI Dungeon Master, Virtual Makeup, the OAuth demos)
- Reference apps we run: Open WebUI, chat, websim
- The playground

**Not here**
- Plugins people install into other tools → [Developer tools](#developer-tools)
- Hosted MCP servers and hosted agents → [Agents & agent tools](#agents--agent-tools)
- Community agents → [Community models](#community-models)
- Internal agents such as Polli → [Internal automation](#internal-automation)

**Examples:** #15695 remove unavailable community apps · #15919 rank listed apps in app_top_weekly · #14372 host Open WebUI with Pollinations as the only login · #14957 update the CatGPT selfie reference

### Data & insights

Getting data into Tinybird (`enter.pollinations.ai/observability/`), and what we read from it to run the business (`operations/kpi/`, `operations/economics/`).

**Covers**
- Datasources, pipes and the generation event schema
- Traffic syncs: GitHub, Cloudflare, Search Console
- Product event recording: page views, sign-in sources
- KPIs, growth metrics and funnels
- Revenue, provider costs, invoices and the economics ledger
- Analysis of user research, such as census answers

**Not here**
- Service health, alerts and monitors → [API & reliability](#api--reliability)

**Examples:** #15823 dedicated Cloudflare token for traffic sync · #15778 weekly GitHub star growth KPI · #14471 reconcile revenue, forecasts and ledger evidence

---

## Boundary rules

| When it's unclear between… | Rule |
|---|---|
| Models · Accounts & keys | A model's routing or price → Models. Which keys or accounts may use a model → Accounts & keys |
| Accounts & keys · Community models | Bans, fraud and abuse → Accounts & keys. The publisher allowlist → Community models |
| Models · Billing & payments | A model's price or route → Models. A request charged the wrong amount → Billing & payments |
| Models · Community models | We run it → Models. A community member publishes it → Community models |
| Agents & agent tools · Developer tools | Runs as an agent or hosted MCP server → Agents. Installed by a developer (SDK, CLI, MCP package, plugin) → Developer tools |
| Dashboard · any area | A screen owned by one area → that area. Shared or cross-cutting UI → Dashboard |
| Dashboard · Brand & news | Building or fixing the banner component → Dashboard. What a banner or notice says, adding or removing one → Brand & news |
| Agents & agent tools · Internal automation | Users run it → Agents. It runs our repo or community → Internal automation |
| Apps | Users submit it, or we maintain it for people to use or copy → App catalog & showcase. People install it into their own code or tools → Developer tools. An agent or MCP server we host → Agents & agent tools. A community member publishes it as an agent → Community models. It runs our own work → Internal automation |
| CI & releases · any area | Secret or key sync → CI & releases, unless the PR is mainly about a feature (the x402 key → Billing & payments) |
