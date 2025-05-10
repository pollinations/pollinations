---
class: scroll
---
<div style="text-align: right; position: absolute; top: 0; right: 0;">
<a href="/10">⬅️ Back to Index</a>
</div>

# 💹 **Financial Model (EOY 2026 - 2000 Apps, 4 Tiers)**

This model projects Pollinations.ai's performance with a 2,000-application ecosystem across four tiers by EOY 2026, featuring a Partner tier revenue share based on **net ad revenue**.
The model forecasts a monthly platform gross profit of **€152,500**. This achieves a gross margin of **~51%** on net retained revenue, or **~36%** on net platform-managed ad revenue. The blended Lifetime Value (LTV) of an average monetized end-user to Pollinations is estimated at **€0.14**. This revised revenue share model significantly improves platform profitability.

## 1. Core Assumptions

### Platform Operations & Monetization

| Parameter                                     | Value                                      | Notes                                                         |
| :-------------------------------------------- | :----------------------------------------- | :------------------------------------------------------------ |
| Compute Cost per Media Unit                   | €0.0005                                    | Fundamental cost for media generation.                        |
| Platform Fixed Costs (Monthly)                | €2,000                                     | E.g., Storage, CDN, basic infrastructure.                     |
| Ad Impressions per Media Unit (Monetized Tiers) | 10%                                        | 1 ad impression per 10 media units.                           |
| **Gross Ad Revenue per 1,000 Media Units**    | **€2**                                     | Total ad revenue generated before any fees or shares.         |
| Implied Gross eCPM (Monetized Tiers)          | €20                                        | Effective cost per mille for ad impressions.                  |
| Ad Network Fee                                | 15% of Gross Ad Revenue                    | Paid to ad networks from total generated revenue.             |
| **Net Ad Revenue (Platform Pool) per 1,000 Media Units** | **€1.70**                       | After 15% ad network fee. This is the base for Partner share. |
| **Partner Tier Revenue Share**                | **50% of Net Ad Revenue from Partner App** | Shared after ad network fees are deducted.                    |

## 2. App Tier Distribution & Per-App Economics (Monthly)

**Target EOY 2026: 2000 Apps**
*   **Explorer (Non-Monetized):** 30% (600 apps)
*   **Creator (Non-Monetized):** 30% (600 apps)
*   **Innovator (Monetized, Non-Rev-Share):** 25% (500 apps)
*   **Partner (Monetized, Net Rev-Share):** 15% (300 apps)

| App Tier    | Apps | Media Units / App | Compute Cost / App (€) | Gross Ad Rev / App (€) | Net Ad Rev / App (€) (after Ad Network Fee) | Creator Payout (€) (Partner Only, 50% of Net) | Pollinations Net Rev / App (€) | **Pollinations Net Contribution / App (€)** |
| :---------- | :--- | :---------------- | :--------------------- | :--------------------- | :---------------------------------------------- | :-------------------------------------------- | :----------------------------- | :------------------------------------------ |
| Explorer    | 600  | 10,000            | 5                      | -                      | -                                               | -                                             | -                              | **-5**                                      |
| Creator     | 600  | 50,000            | 25                     | -                      | -                                               | -                                             | -                              | **-25**                                     |
| **Innovator** | **500**| 200,000           | 100                    | 400                    | 340                                             | -                                             | 340                            | **240**                                     |
| **Partner**   | **300**| 500,000           | 250                    | 1,000                  | **850**                                         | **425**                                       | **425**                        | **175**                                     |

## 3. Aggregated Platform Financials (Monthly, Rounded €)

### 3.1 Costs & Revenue by Tier

| App Tier    | Total Apps | Total Media Units | Total Compute Cost (€) | Total Gross Ad Rev (€) | Total Net Ad Rev (€) (after Ad Network Fee) | Total Creator Payouts (€) | Pollinations Net Rev (€) (after payouts) | **Total Pollinations Net Contribution (€)** |
| :---------- | :--------- | :---------------- | :--------------------- | :--------------------- | :---------------------------------------------- | :------------------------ | :--------------------------------------- | :------------------------------------------ |
| Explorer    | 600        | 6,000,000         | 3,000                  | -                      | -                                               | -                         | -                                        | **-3,000**                                  |
| Creator     | 600        | 30,000,000        | 15,000                 | -                      | -                                               | -                         | -                                        | **-15,000**                                 |
| Innovator   | 500        | 100,000,000       | 50,000                 | 200,000                | 170,000                                         | -                         | 170,000                                  | **120,000**                                 |
| Partner     | 300        | 150,000,000       | 75,000                 | 300,000                | **255,000**                                     | **127,500**               | **127,500**                              | **52,500**                                  |
| **TOTALS**  | **2000**   | **286,000,000**   | **143,000**            | **500,000**            | **425,000**                                     | **127,500**               | **297,500**                              | **154,500**                                 |

### 3.2 Platform Profit & Loss Summary (Monthly, Rounded €)

| Financial Item                                            | Amount (€)      |
| :-------------------------------------------------------- | :-------------- |
| Total Gross Ad Revenue (All Monetized Tiers)              | 500,000         |
| Less: Ad Network Fees (15% of Total Gross Ad Revenue)     | (75,000)        |
| **Net Ad Revenue (Platform Pool before Creator Payouts)** | **425,000**     |
| Less: Payouts to Partner Creators                         | (127,500)       |
| **Total Net Ad Revenue Retained by Pollinations**         | **297,500**     |
| Less: Total Platform Compute Costs (All Tiers)            | (143,000)       |
| **Net Operating Income (before fixed costs)**             | **154,500**     |
| Less: Platform Fixed Costs (Storage/CDN, etc.)            | (2,000)         |
| **PLATFORM MONTHLY GROSS PROFIT**                         | **152,500**     |
|                                                           |                 |
| **Platform Gross Margin (on Net Retained Revenue)**       | **~51%**        |
| **Platform Gross Margin (on Net Platform-Managed Ad Rev)**| **~36%**        |

## 4. Blended End-User LTV (to Pollinations Platform)

This calculates the average Lifetime Value an end-user on a *monetized app* (Innovator or Partner) brings to Pollinations.

**LTV Calculation Assumptions:**
| Parameter                             | Value     | Notes                                   |
| :------------------------------------ | :-------- | :-------------------------------------- |
| Avg. Conversations / End-User / Month | 30        | Assumed user activity.                  |
| End-User Lifetime                     | ~7 months | (1 / 0.15 churn rate, rounded).         |

**LTV Calculation:**
*   **Total Net Revenue to Pollinations from Monetized Apps:** €297,500/month
*   **Total Media Units from Monetized Apps:** 250,000,000 units/month
*   **Average Pollinations Net Revenue per Monetized Media Unit:** ~€0.00119
*   **Contribution Margin (CM) / Media Unit (to Pollinations):**
    ~€0.00119 (Net Rev/Unit) - €0.0005 (Infra Cost/Unit) = **~€0.00069**
*   **Blended End-User LTV (to Pollinations):**
    CM / Media Unit × Avg. Conversations / User / Month × User Lifetime
    = ~€0.00069 × 30 × ~7 months = **~€0.14**