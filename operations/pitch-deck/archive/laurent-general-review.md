*General review – LP – 29 Apr 2025*

## SYNTHESIS OF EXCHANGES & STRATEGIC DIRECTION

Over the last weeks we clarified **who we are**, **what we have already shipped**, and **where we must go next to turn Pollinations into a sustainable, open Generative‑AI platform**. Below is a cleaned‑up snapshot that keeps Laurent’s structure and intent while tightening the language and adding the minimum technical precision needed for engineers, investors, and partners to follow.

---

### 1 / Present & know us

| Name | Role | One‑sentence super‑power |
| :---- | :---- | :---- |
| **Thomas Haferlach** | Co‑founder, CEO & Lead Engineer | Turns research models into global‑scale products (ex‑Amazon music AI) |
| **Elliot Fouchy** | Co‑founder, COO | Runs GPU fleets & keeps prototypes alive under crazy load |
| **Laurent Pacoud** | Corporate‑Dev (pending) | Connects business strategy with product & fundraising |

We are radically complementary: an artist‑engineer, an infra perfectionist, and a “corporatiser”. Our shared enneagram profile (types 4, 1, 7) produces both ambition and friction—but it works.

*Financial reality:* Thomas’s personal runway ends **Aug 2025**. We **must** land revenue or new credits before then.

---

### 2 / Pollinations achievements to date

* In the **last 90 days** users generated **≈ 80 million media assets** (images, text, audio).  
* **Traffic distribution:** 30 % CN, 13 % US, 13 % EU, 6 % IN, long tail elsewhere.  
* **300 + third‑party apps** built with our open APIs—top example: a Roblox Canadian game.  
* Pollinations effectively operates as a **distributed AI incubator**: we mentor developers (“Creators”) who embed our models in their own tools.

---

### 3 / Pollinations technical features

#### • An open‑source *AI toolbox* for developers

* **SDK & AI Integration:** Multiple starter kits with deep AI assistant integration for effortless project setup across different platforms and frameworks.
* **Language & models:** currently image (Stable Diffusion XL custom LoRAs), text (Llama‑3‑8B‑Instruct \+ adapters), audio (MusicGen‑Large).  
* **Community:** Discord (13 k members) \+ GitHub (1.7 k stars) serve as support & co‑creation spaces.

#### • A managed *cloud runtime*

* **GPU fabric:** AWS p‑series \+ LambdaLabs RTX‑A6000 spots, orchestrated by Kubernetes with cluster‑autoscaler.  
* **Cost tracking:** Prometheus → Loki → Grafana nightly roll‑up provides cost‑of‑goods per request.

#### • Consumption to date

We consumed \~**1.4 M GPU‑seconds** out of 3 M credits. At the current burn (\~180 k GPU‑s / month) runway ≈ 8 months. Triton batching and model mixture optimisation could double efficiency.

---

### 4 / Pollinations business models

| Model | Status | Next milestone |
| :---- | :---- | :---- |
| **Personalised ads inside generated assets** | Text ads live (run‑rate €250 k ARR) | Ship CLIP‑guided image ad placement by June |
| **Revenue share with Creators (70/30)** | Pilot cohort (25 apps, €30 k GMV) | Launch self‑serve wallet \+ dashboard |
| **Premium access (subscription / pay‑per‑use)** | Spec phase | Rate‑limited gateway \+ Stripe metering |

Data resale is technically feasible (we already store user geo and prompt metadata) but **on hold** until privacy & brand positioning are clearer.

---

### 5 / User journey, comms & marketing

*Discovery → Discord → Build → Launch* Most users arrive via AI blogs or TikTok demos, join Discord, clone the SDK template, and push a live bot within 30 minutes. We have intentionally **not paid for traffic** yet; growth is organic while we validate monetisation.

A lightweight **application form** for early‑access APIs already captured **100 + verified Creator emails**.

---

### 6 / Entity KPIs (Apr 2025)

| KPI | Value | Comment |
| :---- | :---- | :---- |
| Ad revenue (run‑rate) | €250 k | Only text ads |
| Shared revenue | €30 k | Pilot |
| Registered users | 250 k | OAuth via Discord |
| Media generated / month | 80 M | \+55 % QoQ |
| GPU consumption / month | 180 k GPU‑s | Needs 40 % cut |
| Discord community | 13 k | \+25 % QoQ |

---

### 7 / Risk analysis

| Risk | Likelihood | Impact | Mitigation |
| :---- | :---- | :---- | :---- |
| No product‑market fit | Medium | High | Tighten Creator success stories, double down on Roblox / Unity |
| GPU credits exhausted | High | High | Optimise batching, secure seed round, pursue additional credits |
| Single dev bottleneck | High | Medium | Hire DevOps \+ document infra |
| Outlier API dependency | Low | Medium | Formalise DPA; plan migration |
| Tax / entity alignment | Medium | Low | Engage Estonian counsel |

---

### 8 / Immediate next steps (May–Aug 2025)

1. Release image‑level adsorption model (CLIP + attention masks).  
2. Launch Creator dashboard with live cost / revenue graphs & Stripe Connect payouts.  
3. Migrate inference to NVIDIA Triton \+ dynamic batching (gpu‑s/request −40 %).  
4. Close **€2.5–3 M seed** to extend runway to 24 months.

---

*Document edited for technical clarity; original narrative structure preserved.*
