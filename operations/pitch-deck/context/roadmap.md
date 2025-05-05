# 🛣️ Pollinations.ai Roadmap

> **Baseline – End of Q2 2025 (June 2025)**
> • 3 M MAU · 80 M monthly generations · **≈ \$0 ARR (ads test)** · Team 10 FTE
> • **Ads only for *unregistered* apps – live** (text‑only line appended when request lacks a Pollinations token)
> • **Authentication – live** (`pollinations-init` issues tokens; app‑domain ↔ token store)
> • **Edge Services – live** (image, text & audio generation at scale; open‑source React SDK)
> *Mission*: “Make AI creation universally accessible by funding SOTA tools through advertising and shared revenue.”

---

## Q3 2025 → Q2 2026 ▸ **Infra Hardening & Ad‑Revenue Take‑off** (12‑Month Plan)

> **Objective:** Grow ad‑driven ARR from ≈ \$0 → \$2 M and be **Seed‑Ready by January 2026** by optimising contextual relevance and launching a revenue‑share program that motivates developers to embed ads gracefully, while the core UI stays free and creators access full data via the Pollinations MCP server.

| Quarter                                            | Key Deliverables                                                                                                                                                                                                                                    | KPIs                                                                                        | Owners / Budget                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Q3 2025 — Observability & Context**              | • Real‑time ad‑telemetry pipeline<br>• Contextual‑embedding service v1 (prompt + user‑agent)<br>• GPU spot‑fleet autoscaling & canary deploys                                                                                                       | • Ad‑append latency < 40 ms<br>• CTR ≥ 8 % on unregistered traffic<br>• Infra \$/gen ▼ 15 % | DevOps €25 K · ML €30 K                |
| **Q4 2025 — Rev‑Share, Brand‑Safety & Yield Lift** | • **Developer Revenue‑Share Program** (docs + sample React component)<br>• **Ads context classifier (ISO 23000)**<br>• Multi‑format ads (rich‑text & image)<br>• Self‑serve advertiser dashboard β                                                  | • eCPM > \$4<br>• 4 M MAU<br>• ARR run‑rate \$500 K                                         | Ad‑Ops €20 K · ML €20 K · Design €10 K |
| **Q1 2026 — Seed‑Raise Kick‑off (Jan 2026)**       | • Seed fund‑raise launch **1 Jan 2026** (target €2–4 M)<br>• Contextual ad ranker v2 (transformer‑based)<br>• Compliance audit (GDPR/CCPA, EU AI Act draft)<br>• Data‑warehouse v1 surfaced in MCP                                                  | • Term‑sheet signed by Mar 2026<br>• \$2 M ARR<br>• 6 M MAU                                 | Exec & Ops €30 K                       |
| **Q2 2026 — Post‑Seed Scale‑up**                   | • Seed capital (€2–4 M) in bank<br>• Deploy additional GPU clusters (Spot + Reserved blend)<br>• Launch rich‑media (audio & image) ads GA<br>• **Freemium Pro design freeze & billing POC**<br>• Spec Style‑Packs marketplace API (micro‑purchases) | • eCPM > \$5<br>• 8 M MAU<br>• ARR run‑rate \$3 M                                           | Eng & Growth €40 K                     |

**Exit criteria:** Seed round (€2–4 M) closed **Mar 2026**, ARR \$2 M, latency < 40 ms, compliance clean sheet → commence scale‑up in Q2 2026.

---

## 24 – 36 Months ▸ **Multi‑Revenue Flywheel** (May 2026 → Apr 2028)

| Stream                       | Milestones                                                                                                                                            | Launch & Targets                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Freemium Pro Tier**        | • Feature‑gating & premium queue (Q3 26)<br>• Unlimited HD, private gen, Teams workspace                                                              | Launch Q4 26 → 150 K subs @ €12/mo ≈ €21.6 M ARR |
| **In‑App Micro‑Purchases**   | • Style Packs marketplace<br>• GPU Boost tokens (pay‑as‑you‑go)<br>• Dynamic pricing engine                                                           | β Q1 27 → GMV €4 M in Year 1                     |
| **API / SaaS Licensing**     | • “Prompt‑as‑a‑Service” for enterprises<br>• SLAs, single‑tenant deploys                                                                              | GA Q2 27 → €6 M ARR by 2028                      |
| **Data Services & Insights** | • Aggregate & anonymise prompt/response corpus (privacy‑by‑design)<br>• Analytics API for devs & enterprises<br>• Dataset licensing to model partners | GA Q3 27 → €3 M ARR by 2028                      |
| **Ads Evolution**            | • Contextual video & audio ads<br>• CPM optimiser powered by GenAI                                                                                    | Maintain \~45 % revenue share                    |
