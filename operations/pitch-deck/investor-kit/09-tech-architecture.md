# pollinations.ai **End-to-End Architecture**  (Creator uses a text editor only)

```
IDE / Cursor / VS Code                Pollinations Cloud
┌────────────────────────────┐        ┌────────────────────────┐
│ 1. Creator's Editor        │  JSON │ 2. Code MCP            │
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
│   • src/, CNAME, gh-pages.yaml    │   │  • build & test             │
│   • plugins.json (opt)            │   │  • next export              │
└────────────────────────────────────┘   │  • deploy to GitHub Pages   │
                                         └─────────┬───────────────────┘
                                                   │HTTPS
                                                   ▼
                              ┌────────────────────────────────────────┐
                              │ 5. GitHub Pages  (your-app.com)        │
                              │ (End-User Interaction Point)           │
                              └─────────▲──────────────┬───────────────┘
                                        │runtime calls │plugin scripts
                                        ▼              ▼
                              ┌────────────────────────────────────────┐
                              │ 6. Pollinations Edge Services          │
                              │    • Auth MCP  • Generative AI APIs           │
                              │    • Ad Serving & Rate-Limit Engine   │
                              │    • Usage DB / Ad € & Cloud € Tracking│
                              │    • Creator Premium Billing API (Q2 '26+) │
                              │    • Ad Rev-Share Ledger (Q4 '26+ Opt-in)│
                              └────────────────────────────────────────┘
```

---

## **How it works (fully automated)**

1. **In the IDE** the Creator types pollinations-init your-app.com.

2. The local **MCP SDK** calls **Code MCP** over HTTPS.

3. **Code MCP** authenticates the Creator (Pollinations Auth MCP → GitHub OAuth), **creates a private repo**, copies the *Next-site* starter template into it, adds CNAME, secrets and a ready-made gh-pages.yaml workflow, then pushes the first commit.

4. GitHub **Actions** in that repo automatically build, test and deploy the static site to **GitHub Pages**; the custom domain resolves because Code MCP simultaneously inserted your-app.com ⇄ repo mapping into the Usage DB and triggered DNS/SSL provisioning.

5. When End-Users hit the Creator's site:
    *   **Default Model (Ad-Funded Tiering):** The front-end calls Pollinations **Generative AI APIs** and loads **ad plugins** (from Ad Providers). Auth MCP meters usage, and the Rate-Limit Engine dynamically adjusts the app's operational tier/limits based on its Ad € / Cloud € ratio.
    *   **Optional Creator Choices (from 2026):**
        *   If the Creator subscribed to Premium (from Q2 '26): The Creator Premium Billing API confirms status. Rate-Limit Engine applies guaranteed tiers/limits, potentially disabling ads.
        *   If the Creator opted into Ad Rev-Share (from Q4 '26): The Ad Rev-Share Ledger tracks attributable Ad Revenue for payout. Tiering rules may differ.

**The Creator never leaves the editor; no dashboard button is required.**

---

## **The pipeline in four sentences**

1. A single CLI command in the editor sends an MCP request that scaffolds a new GitHub repo for the Creator with all secrets, workflows and domain settings pre-wired.

2. Every commit pushed to that repo triggers GitHub Actions, which build and publish the site to GitHub Pages under the Creator's custom domain, accessible to End-Users.

3. At runtime, the static site talks to Pollinations' edge **Generative AI APIs**. Depending on the Creator's choice (Premium Sub or Ad Rev-Share - from 2026) or the default model, ads are served (or not) and the Rate-Limit Engine manages the app's operational tier.

4. Nightly jobs roll up usage and Ad Revenue. For default apps, they refine the Ad € / Cloud € ratio to update the operational tier. For optional models (from 2026), they also check Creator Premium status and populate the Ad Rev-Share Ledger.

---

## **"Why it matters" — non-technical explanation**

Pollinations gives Creators a **one-command factory** for AI-powered web apps that serve End-Users:

* **Zero-ops** – Creators stay in their usual code editor; our Control Plane spins up infrastructure, domain, SSL and CI/CD automatically.

* **Infinite scale** – Finished apps are just static files on GitHub Pages for End-Users. Heavy lifting runs on Pollinations' AI edge where we:
    *   (Default Model) Batch, optimize, and dynamically adjust operational tiers based on ad performance.
    *   (From 2026) Offer Creators Premium Subscriptions and optional 50/50 Ad Revenue sharing.

* **Aligned incentives** – 
    *   (Default Model) Rate-Limit Engine links app capability to self-funding via ads (Ad € / Cloud € ratio).
    *   (From 2026) Creators gain choices: pay Premium for guarantees OR opt-into direct Ad Revenue sharing.

* **Single source of truth** – All core services (SDKs, templates, **Generative AI APIs**, tiering logic, future billing/ledger) live in one audited repository; every new app forks from that gold master.

In short, Pollinations turns the complex stack into a **SaaS utility**. We capture Ad Revenue and manage app capabilities via dynamic tiering (default). From 2026, we add Creator Premium Subscriptions and optional Creator Ad Rev-share. 