# What is eCPM?
*   eCPM (effective Cost Per Mille) measures how much revenue a publisher earns for every 1,000 ad impressions.
*   It normalizes all pricing models (CPM, CPC, CPA, CPV…) to a single "per-thousand-impressions" metric, so publishers can compare the yield of different ad types on an apples-to-apples basis.

---

## Who's involved? (Stakeholders)
1.  **Advertiser**
    *   The brand or marketer paying to display ads.
    *   Wants the best ROI: low cost for views, clicks, or actions.
2.  **Publisher**
    *   The website, app, or content owner displaying the ads.
    *   Wants to maximize ad revenue by choosing the highest-yield ads.
3.  **Ad Network / Exchange / SSP**
    *   Aggregates publisher inventory and connects it to demand sources.
    *   Runs auctions, applies targeting, and handles ad delivery.
4.  **Demand-Side Platform (DSP)**
    *   Technology used by advertisers (or their agencies) to bid on inventory in real time.
5.  **Agency / Affiliate Network**
    *   Manages campaign strategy, creative, and buys media on behalf of the advertiser (or runs affiliate offers).
6.  **End User**
    *   The person seeing or interacting with the ad.
    *   Their behavior (views, clicks, conversions) drives all revenue calculations.

---

## The Core Formula

```
eCPM = (Total Revenue ÷ Total Impressions) × 1,000
```

All the formulas below are just special cases of this, plugging in the right revenue and event counts for each ad model.

---

## 1. Impression-Based Ads (CPM)
*   **Pricing model:** Advertiser pays a fixed CPM rate (cost per 1,000 impressions).
*   **eCPM:**

    ```
    eCPM_CPM = (Revenue_from_CPM_ads ÷ Impressions) × 1,000
              = (CPM_rate × Impressions/1,000 ÷ Impressions) × 1,000
              = CPM_rate
    ```

---

## 2. Click-Through Ads (CPC)
*   **Pricing model:** Advertiser pays per click.
*   **Revenue:** Clicks × Cost Per Click
*   **eCPM:**

    ```
    eCPM_CPC = (Clicks × CPC_rate ÷ Impressions) × 1,000
    ```

---

## 3. Text Ads

Text ads are usually sold on CPC or CPM, so you pick the relevant formula:
*   CPC-based text ads: same as eCPM_CPC above.
*   CPM-based text ads: same as eCPM_CPM above.

---

## 4. Video Ads (CPV)
*   **Pricing model:** Advertiser pays per view (or per completed view).
*   **Revenue:** Views × Cost Per View
*   **eCPM:**

    ```
    eCPM_Video = (Video_Views × CPV_rate ÷ Impressions) × 1,000
    ```

---

## 5. Audio Ads

Audio ads often follow CPM or CPV:
*   CPM audio: same as eCPM_CPM.
*   CPV audio:

    ```
    eCPM_Audio_CPView = (Audio_Plays × CPV_rate ÷ Impressions) × 1,000
    ```

---

## 6. Affiliate Ads (CPA)
*   **Pricing model:** Advertiser pays when a user completes an action (sale, lead).
*   **Revenue:** Conversions × Commission Per Conversion
*   **eCPM:**

    ```
    eCPM_Affiliate = (Conversions × CPA_rate ÷ Impressions) × 1,000
    ```

---

## Why eCPM Matters
*   Publishers can rank different ad partners by eCPM to decide who to prioritize in their waterfall or header-bidding setup.
*   Advertisers/Agencies can gauge the true cost of each inventory type, even if one campaign is CPM-based and another is CPC/CPA/CPV-based.

---

## Average Revenue Benchmarks by Ad Model

Below is a summary table showing typical average revenue rates (“unit rates”) and their equivalent eCPM (revenue per 1,000 impressions) for each ad model. Note that actual results vary by app category, region, and demand source.

| Ad Model                      | Unit Rate                                  | eCPM Equivalent                      | Sources |
|-------------------------------|--------------------------------------------|--------------------------------------|---------|
| Impression (Banner CPM)       | $0.50–$1.20 (≈$0.85 average) per 1,000 impressions | $0.85 per 1,000 impressions          |         |
| Impression (Interstitial CPM) | $3.43 per 1,000 impressions                | $3.43 per 1,000 impressions          |         |
| Click-Through (Display CPC)   | $0.63 per click                            | $2.90 eCPM (at 0.46% CTR)            |         |
| Text Ads (Search CPC)         | $2.69 per click                            | $85.52 eCPM (at 3.17% CTR)           |         |
| Video (Rewarded CPV)          | $10.00 per 1,000 views                     | $10.00 per 1,000 views               |         |
| Audio (Podcast CPM)           | $22.50 per 1,000 listens                   | $22.50 per 1,000 listens             |         |
| Affiliate (CPA)               | $48.96 per conversion                      | $979.20 eCPM (at 2% conversion rate) |         |

*   **Banner & Interstitial:** Serve as the low- and mid-range on the CPM spectrum—banners average below $1, interstitials around $3.
*   **CPC Models:** Display clicks pay around $0.63 each, yielding an eCPM near $2.90 given a typical 0.46% CTR; search‐style text ads pay higher CPC (≈$2.69), with eCPM around $85.
*   **Video & Audio:** Rewarded video remains one of the highest-yielding in-app formats at $10 eCPM; podcast/audio ads command premium CPMs of $20–$25 (≈$22.50 average).
*   **Affiliate (CPA):** Performance‐based, averaging about $49 per conversion; with a 2% conversion rate on impressions, that translates to an effective $979 eCPM—reflecting the high value of each completed action.

These benchmarks are broad averages—your own eCPMs may be higher or lower based on geography, app category, seasonality, and ad network performance.