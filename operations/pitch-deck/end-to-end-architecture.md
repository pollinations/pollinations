# pollinations.ai **End-to-End Architecture**  (developer uses a text editor only)

```
IDE / Cursor / VS Code                Pollinations Cloud
┌────────────────────────────┐        ┌────────────────────────┐
│ 1. Developer’s Editor      │  JSON │ 2. Code MCP            │
│   • pollinations-init cmd ─────────►│  • OAuth w/ GitHub     │
│   • git add/commit         │        │  • Create private repo │
└────────────────────────────┘        │  • Inject secrets      │
        ▲   ▲                         │  • Push starter code   │
        │   │ LLM suggestions         └──────┬─────────────────┘
        │   └── via MCP SDK                  │
        │                                    │webhook
        │                                    ▼
┌───────┴───────────────────────────┐   ┌──────────────────────────────┐
│ 3. Per-App GitHub Repo            │   │ 4. GitHub Actions (template) │
│   • src/, CNAME, gh-pages.yml     │   │  • build & test             │
│   • plugins.json (opt)            │   │  • next export              │
└────────────────────────────────────┘   │  • deploy to GitHub Pages   │
                                         └─────────┬───────────────────┘
                                                   │HTTPS
                                                   ▼
                              ┌────────────────────────────────────────┐
                              │ 5. GitHub Pages  (myapp.com)           │
                              └─────────▲──────────────┬───────────────┘
                                        │runtime calls │plugin scripts
                                        ▼              ▼
                              ┌────────────────────────────────────────┐
                              │ 6. Pollinations Edge Services          │
                              │    • Auth MCP  • Gen-AI APIs          │
                              │    • Monetization Plugins CDN         │
                              │    • Usage / Billing DB               │
                              └────────────────────────────────────────┘
```

---

## **How it works (fully automated)**

1. **In the IDE** the dev types pollinations-init myapp.com.

2. The local **MCP SDK** calls **Code MCP** over HTTPS.

3. **Code MCP** authenticates the dev (Pollinations Auth MCP → GitHub OAuth), **creates a private repo**, copies the *Next-site* starter template into it, adds CNAME, secrets and a ready-made gh-pages.yml workflow, then pushes the first commit.

4. GitHub **Actions** in that repo automatically build, test and deploy the static site to **GitHub Pages**; the custom domain resolves because Code MCP simultaneously inserted myapp.com ⇄ repo mapping into the Usage DB and triggered DNS/SSL provisioning.

5. When visitors hit the site, the front-end calls Pollinations **Gen-AI APIs** (image, text, audio) and optionally loads **paywall/ads plugins**. Auth MCP meters usage and enforces the plan tier.

**The developer never leaves the editor; no dashboard button is required.**

---

## **The pipeline in four sentences**

1. A single CLI command in the editor sends an MCP request that scaffolds a new GitHub repo with all secrets, workflows and domain settings pre-wired.

2. Every commit pushed to that repo triggers GitHub Actions, which build and publish the site to GitHub Pages under the developer’s custom domain.

3. At runtime the static site talks to Pollinations’ edge APIs for AI generation and monetization, while Auth MCP tracks token usage per domain.

4. Nightly jobs roll up GPU seconds, ad revenue and subscription upgrades into billing exports, so cost-of-goods and revenue share are always up to date.

---

## **“Why it matters” — non-technical explanation**

Pollinations gives creators a **one-command factory** for AI-powered web apps:

* **Zero-ops** – Developers stay in their usual code editor; our Control Plane spins up infrastructure, domain, SSL and CI/CD automatically.

* **Infinite scale** – Finished apps are just static files on GitHub Pages, so hosting is effectively free and globally cached; heavy lifting (image generation, chat, TTS) runs on Pollinations’ AI edge where we can batch, optimise and monetise centrally.

* **Aligned incentives** – Because every request flows through our Auth gateway, we see usage in real time and can attach ads, subscriptions or pay-per-render without touching the developer’s code.

* **Single source of truth** – All core services (SDKs, templates, AI APIs, billing logic) live in one audited repository; every new app forks from that gold master, guaranteeing compatibility and fast security roll-outs.

In short, Pollinations turns the complex stack of servers, GPUs, billing and compliance into a **SaaS utility** that developers tap with a single command, while we capture margin on compute and monetization at the edge.

