# 📊 Pollinations.AI – Market Sizing & Unit Economics

## Slide 1 – Market Sizing (TAM | SAM | SOM)

> **Approach:** Industry TAM → Indie SAM → Gen‑AI beach‑head → Map *today*, *latent* (6 mo) and *2027* SOM tiers to concrete traffic & monetisation milestones.

| Metric | € / \$ | Timeframe | Key assumption / note |
|--------|--------|-----------|-----------------------|
| **TAM** | **\$234 B** | 2025 | Global AI‑contextual ad spend (industry analysts). |
| **SAM** | **\$140 B** | 2025 | ~60 % of TAM reachable via indie web & in‑app inventory. |
| **Beach‑head segment** | **\$3.4 B** | 2025 | Generative‑AI creatives (≈ 25 % YoY growth). |
| **SOM – Captured** | **€ 0** | Today | Monetisation switch‑off → no revenue yet. |
| **SOM – Latent** | **€ 1 M ARR** | **+6 months** | Monetise current 15 M conversations/mo at blended eCPM €3.75 & 50 % share. |
| **SOM – Target 2027** | **€ 70 M ARR** | 3 yrs | 0.05 % of SAM via MAU & Creator scaling. |

**Latent SOM calculation:**  
15 M conversations/mo × 1 ad/conv × €3.75 eCPM × 50 % (Pollinations share) ≈ €83 K / mo ⇒ **€1 M ARR** once ad stack is live (ETA ≈ 6 months).

---

## **Slide 2 – Monetisation Model & Core Assumptions**  

> **Approach:** model one paid ad per conversation; blend eCPM from CTR × CPC; subtract per‑conversation infra cost.

| Block | Key numbers |
|-------|-------------|
| **Engagement** | 30 convs / End‑User / mo. |
| **Ad Supply (100 % fill)** | 1 paid ad per conversation. |
| **Ad Mix / Pricing** | • Text: 50 % · eCPM \$2.50 <br>• Rich: 50 % · eCPM \$5.00 <br>• **Blended eCPM \$3.75** |
| **Revenue Split** | 50 % Pollinations · 50 % Creator. |
| **Infra Cost** | \$0.001 per conversation. |
| **Churn ⇒ Lifetime** | 15 % / mo ⇒ 6.7 mo. |

---

## **Slide 3 – Unit Economics & End‑User LTV**  

> **Approach:** compute CM per user (revenue − cost) then multiply by user lifetime for LTV.

| Metric (Poll share) | Formula | Result |
|---------------------|---------|--------|
| Imps / user / mo | 30 × 100 % | **30** |
| Net Rev / user / mo | 30 × (3.75/1000) × 0.5 | **\$0.056 25** |
| Cost / user / mo | 30 × 0.001 | **\$0.03** |
| **CM / user / mo** | Rev − Cost | **\$0.026 25** |
| **End‑User LTV** | CM / mo × 6.7 mo | **\$0.175** |

---

## **Slide 4 – Creator Economics, CAC & Revenue Outlook**  

> **Approach:** scale CM to Creator MAU for Creator LTV, and build CAC bottom‑up from hackathon/social budget.

### Creator LTV  
* 150 K MAU • 24 mo ⇒ **\$94.5 K**  

### CAC  
| Item | Value |
|------|-------|
| Budget | \$12 K / yr |
| New Creators | 9 700 |
| **CAC / Creator** | **\$1.24** |
| Ceiling (LTV ÷ 3) | \$31.5 K → CAC ≪ ceiling |

### Revenue Snapshot (Pollinations share)  

| MAU | Monthly Rev | Yearly Rev | Monthly CM | Yearly CM |
|-----|-------------|-----------|------------|-----------|
| **3 M (now)** | \$168 K | \$2.0 M | \$78 K | \$0.95 M |
| **15 M (12 mo)** | \$844 K | \$10.1 M | \$394 K | \$4.73 M |

**Take‑aways:**  
1. Positive margin with light ads.  
2. Creator LTV dwarfs CAC.  
3. eCPM (CTR × CPC from Ad Providers) is main revenue lever.

---

## 💡 Notes

- **Pollinations.AI keeps 50% of ad revenue**, with the other 50% paid to the app developer.
- **End users are not compensated**, but generate value through contextual engagement.
- **Costs are minimal at scale** due to lightweight infra and non-intrusive ads.
- **Scalability is built in**: monetization grows with usage, not capped by user count.
"""

---

## 📘 Explanation of Each Value 

### Market Sizing  
- **TAM – Total Addressable Market**   
  Global spend on AI‑contextual ads (all platforms, 2025). Theoretical upper limit.  
- **SAM – Serviceable Addressable Market**   
  Share of TAM reachable through indie apps & web surfaces where Pollinations.AI can integrate (~60 % of TAM).  
- **Beach‑head Segment**   
  Rapid‑growth slice of SAM where generative‑AI personalises creative. First target niche.  
- **SOM (Now)**   
  Pollinations’ current slice of SAM (≈ \$1 M ARR).  
- **SOM (Goal)**   
  Target share by 2027, assuming scale‑up of users & Creator integrations.  

---

### Unit‑Economics (per **End‑User**)  
| Term | What it means |
|------|---------------|
| **Conversations / month** | Avg. chatbot sessions an End‑User starts (baseline = 30). |
| **Fill Rate** | % of ad requests that return a paid creative (set to **100 %**: one ad per conversation). |
| **CTR** | Click‑through rate (5 % for both ad types). |
| **CPC** | Cost an Ad Provider pays per click (text \$0.05, rich \$0.10). |
| **eCPM (text, rich)** | CTR × CPC × 1000 → \$2.50 (text), \$5.00 (rich). |
| **Blended eCPM** | Share‑weighted average of the two formats (50 / 50 mix → \$3.75). |
| **Platform Split** | 50 % Pollinations · 50 % Creator. |
| **Infra Cost / conversation** | \$0.001 to process & deliver each session. |
| **Net Revenue / month** | Imps × blended eCPM/1000 × Platform share. |
| **CM – Contribution Margin / month** | Net revenue − infra cost. |
| **CM / year** | CM/month × 12. |

---

### LTV – Lifetime Value  
| Term | What it means |
|------|---------------|
| **Monthly Churn** | % of End‑Users who leave each month (15 %). |
| **User Lifetime** | 1 ÷ Churn ≈ 6.7 months. |
| **End‑User LTV** | CM/month × User Lifetime (≈ \$0.175 for Pollinations share). |

---

### Creator Economics  
| Term | What it means |
|------|---------------|
| **Creator MAU** | Avg. monthly active End‑Users one Creator brings (150 K). |
| **Creator Lifetime** | Expected active period on platform (24 months). |
| **Creator LTV** | CM/month × Creator MAU × Creator Lifetime (≈ \$94.5 K). |

---

### CAC – Creator Acquisition Cost
| Term | What it means |
|------|---------------|
| **Acquisition Budget** | Annual spend on Discord/Twitter campaigns & hackathons (\$12 K). |
| **New Creators / yr** | Expected onboarding volume (9  700). |
| **CAC per Creator** | Budget ÷ New Creators (≈ \$1.24). |
| **Acceptable CAC Ceiling** | Rule‑of‑thumb max (Creator LTV ÷ 3 ≈ \$31.5 K). |

---

### Ad‑Serving Model Glossary  
- **Ad Provider** – supplies and pays for ads (net of Pollinations/Creator split).  
- **Creator** – indie dev/team integrating the SDK; receives 50 % of ad revenue.  
- **End‑User** – person interacting with the chatbot, generating conversations & ad views.  
- **Impression** – a single ad shown (one per conversation in current design).  
- **Revenue / Impression** – Blended eCPM ÷ 1000 × Platform share (=\$0.001875 to Pollinations).  
