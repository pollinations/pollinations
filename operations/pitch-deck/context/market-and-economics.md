# 📊 Pollinations.AI – Market Sizing & Unit Economics

## Slide 1: Market Sizing (TAM, SAM, SOM)

| Metric         | Estimate    | Assumption / Notes |
|----------------|-------------|---------------------|
| **TAM**        | $234B       | Global AI-contextual ad spend (2025, industry reports) |
| **SAM**        | $140B       | 60% of TAM = indie web + in-app inventory |
| **Beachhead**  | $3.4B       | Generative-AI ads subsegment (~25% YoY growth) |
| **SOM (Now)**  | $1M ARR     | Based on current monetization (~15M MAU) |
| **SOM (Goal)** | $70M ARR    | 0.05% of SAM by 2027 |

> **Approach**: Start from total market (TAM), apply indie share (SAM), focus on Gen-AI segment as beachhead. Use current ARR to estimate SOM and growth trajectory.

---

# Unit Economics, LTV & CAC

## 1 · Approach  

| Parameter | Assumption |
|-----------|------------|
| Conversations / End‑User / mo | **30** |
| Fill‑rate | **100 %** (one Ad Provider creative per conversation) |
| Ad mix | 50 % text, 50 % rich/image |
| CTR | **5 %** (both formats) |
| CPC | \$0.05 (text) · \$0.10 (rich) |
| eCPM<sub>text</sub> | 0.05 × 0.05 × 1000 = **\$2.50** |
| eCPM<sub>rich</sub> | 0.05 × 0.10 × 1000 = **\$5.00** |
| Blended eCPM | \(0.5 · 2.50 + 0.5 · 5.00\) = **\$3.75** |
| Platform split | 50 % Pollinations · 50 % Creator |
| Infra cost | **\$0.001** per conversation |
| Monthly churn | **15 %** ⇒ End‑User lifetime ≈ **6.7 mo** |

## 2 · Base Monetisation  

| Metric | Formula | Result |
|--------|---------|--------|
| Imps / End‑User / mo | 30 × 100 % | **30** |
| Net revenue / End‑User / mo | 30 × (3.75/1000) × 0.5 | **\$0.056 25** |
| Cost / End‑User / mo | 30 × 0.001 | **\$0.03** |
| **Contribution margin / End‑User / mo** | 0.056 25 − 0.03 | **\$0.026 25** |
| **CM / End‑User / yr** | × 12 | **\$0.315** |

## 3 · End‑User LTV  

\[
\text{LTV} = \text{CM}_{\text{mo}} \times \text{lifetime} = 0.02625 \times 6.7 \approx \mathbf{\$0.175}
\]

## 4 · Creator Economics  

| Assumption | Value |
|------------|-------|
| Avg. MAU per Creator | **150 K** |
| Creator lifetime | **24 mo** |
| **Creator LTV** | 0.02625 × 150 000 × 24 ≈ **\$94.5 K** |

## 5 · CAC (Creator Acquisition)  

| Item | Value |
|------|-------|
| Annual acquisition budget | **\$12 K** |
| New active Creators / yr | **9 700** |
| **CAC per Creator** | **\$1.24** |
| Acceptable ceiling (LTV ÷ 3) | **\$31.5 K** → **well below** limit |

> **Dominant channel:** low‑cost online hackathons & Discord/social campaigns.

## 6 · Revenue Snapshot  

| MAU | Poll Monthly Rev | Poll Yearly Rev | Poll Monthly CM | Poll Yearly CM |
|-----|------------------|-----------------|-----------------|----------------|
| **Current 3 M** | \$168 750 | \$2.03 M | \$78 750 | \$0.95 M |
| **12‑month 15 M** | \$843 750 | \$10.1 M | \$393 750 | \$4.73 M |

---

### Key Take‑aways
1. **Positive margin** despite low ARPU, thanks to \$0.001 infra cost.  
2. **Creator CAC (\$1.24)** is negligible compared with **\$94 K Creator LTV**.  
3. **Blended eCPM (3.75 $)**—driven by Ad Provider CTR & CPC—is the main revenue lever: small gains flow directly into margin.

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
