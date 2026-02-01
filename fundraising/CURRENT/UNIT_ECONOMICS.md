# 📊 Unit Economics (High-Level)

> **⚠️ DRAFT v1 - For Internal Review Only**

**Created**: February 2, 2026  
**Source**: Financial Model + mycel-extract metrics  
**Status**: DRAFT - Needs Finance Review

---

## Summary Metrics

| Metric | Current (Jan 2026) | Target (Dec 2026) | Notes |
|--------|-------------------|-------------------|-------|
| **Gross Margin** | N/A (pre-revenue) | 75% | Industry standard |
| **CAC** | ~$0 | ~$0 | Organic/community growth |
| **LTV** | TBD | €200+ | 3-month payback target |
| **LTV:CAC** | ∞ | ∞ | No paid acquisition |
| **Payback Period** | N/A | <1 month | Prepaid model |

---

## Revenue Per User

### Developer Economics (B2B)

| Metric | Value | Source |
|--------|-------|--------|
| **Weekly Paying Customers** | 77 | Jan 5, 2026 data |
| **Weekly Revenue** | $820 | Jan 5, 2026 data |
| **Revenue per Paying Dev** | ~$10.65/week | Calculated |
| **Monthly ARPU (Paying)** | ~$42 | Calculated |
| **Conversion (WAU → Paying)** | 1.8% | Jan 5, 2026 data |

### End-User Economics (B2C via Apps)

| Metric | Target | Basis |
|--------|--------|-------|
| **ARPU** | €80/month | Roblox game benchmark |
| **Conversion** | 5% | Industry average for F2P |
| **Retention (M1)** | 40% | Based on weekly cohorts |
| **Lifetime Value** | €160-200 | 2-3 month average lifetime |

---

## Cost Per User

### COGS Breakdown (Pre-Monetization)

| Component | Monthly Cost | Per WAU (4,188) |
|-----------|--------------|-----------------|
| **AI Inference** | $35,000 | $8.36 |
| **Infrastructure** | $3,000 | $0.72 |
| **Observability** | $2,000 | $0.48 |
| **Total COGS** | $40,000 | **$9.55** |

### COGS Breakdown (Post-Monetization Target)

| Component | % of Revenue | Notes |
|-----------|--------------|-------|
| **AI Inference** | 20% | Volume discounts |
| **Infrastructure** | 3% | Scales efficiently |
| **Platform/Other** | 2% | Fixed costs amortized |
| **Total COGS** | **25%** | Target GM: 75% |

---

## Contribution Margin

### Per Developer (Paying)

| Line Item | Amount | Notes |
|-----------|--------|-------|
| **Revenue** | $42/month | Current ARPU |
| **COGS (25%)** | -$10.50 | Post-monetization |
| **Contribution Margin** | **$31.50** | 75% margin |

### Per End-User (Target)

| Line Item | Amount | Notes |
|-----------|--------|-------|
| **Revenue** | €80/month | Target ARPU |
| **COGS (25%)** | -€20 | Post-monetization |
| **Take Rate (4%)** | -€3.20 | Payment processing |
| **Contribution Margin** | **€56.80** | 71% margin |

---

## Customer Acquisition Cost (CAC)

### Current Acquisition Channels

| Channel | Cost | Volume | CAC |
|--------|------|--------|-----|
| **Organic (GitHub, HN)** | $0 | 60% | $0 |
| **Discord Community** | $0 | 25% | $0 |
| **Word of Mouth** | $0 | 15% | $0 |
| **Blended CAC** | — | — | **$0** |

### Why Zero CAC Works

1. **Product-Led Growth**: No signup required, viral by design
2. **Community Flywheel**: 17K Discord members helping each other
3. **Open Source**: GitHub stars (3.8K) drive discovery
4. **Embedded in Apps**: Users discover via apps built on Pollinations

---

## LTV:CAC Analysis

| Segment | LTV | CAC | LTV:CAC | Payback |
|---------|-----|-----|---------|---------|
| **Developer (Paying)** | €200+ | $0 | ∞ | Immediate |
| **End-User** | €160-200 | $0 | ∞ | Immediate |

**Interpretation**: Infinite LTV:CAC is unsustainable narrative-wise. Better framing:
- "Zero paid acquisition to date"
- "All growth organic/community-driven"
- "Will invest in paid when unit economics proven at scale"

---

## Cohort Retention Analysis

### Weekly Cohorts (Jan 2026)

| Cohort | Users | W1 | W2 | W3 | W4 |
|--------|-------|----|----|----|----|
| 2026-01-05 | 1,312 | 46% | — | — | — |
| 2025-12-29 | 1,552 | 64% | 43% | — | — |
| 2025-12-22 | 1,286 | 74% | 68% | 55% | — |
| 2025-12-15 | 679 | 71% | 62% | 60% | 44% |

**Analysis**:
- W1 retention averages ~64%
- W4 retention ~44%
- Suggests ~2-3 month average developer lifetime
- Strong for API product (many just testing)

---

## Conversion Funnel

### Current Funnel (Week of Jan 5, 2026)

```
Signups:          2,888
      ↓ 145% (returning users)
Activated (D7):   4,188
      ↓ 100%
Active (WAU):     4,188
      ↓ 1.8%
Paying:           77
```

### Target Funnel (Q4 2026)

```
New Signups:      600/day × 30 = 18,000/month
      ↓ 100%
Activated:        18,000
      ↓ 50% (returning)
Active (MAU):     50,000
      ↓ 5%
Paying Devs:      2,500
      ↓ €30 ARPU
Dev Revenue:      €75,000/month

App Users:        5,000,000 MAU
      ↓ 2% paying
Paying Users:     100,000
      ↓ €80 ARPU
User Revenue:     €8,000,000/month (long-term)
```

---

## Break-Even Analysis

### Monthly Break-Even

| Scenario | Revenue Needed | Paying Users Needed |
|----------|----------------|---------------------|
| **Cover COGS only** | €40K | 1,000 @ €40 ARPU |
| **Cover COGS + OpEx** | €65K | 1,625 @ €40 ARPU |
| **First Profitable Month** | €115K | Mar 2026 target |

### Path to Break-Even (Mar 2026)

| Component | Target |
|-----------|--------|
| Pollen GMV | €80K |
| Dev Top-Ups | €25K |
| Ads | €10K |
| **Total** | €115K |
| COGS (25%) | -€28.75K |
| Fees (4%) | -€4.7K |
| OpEx | -€25K |
| **Net** | **€56.55K** ✅ |

---

## Key Assumptions & Risks

### Assumptions

| Assumption | Value | Confidence |
|------------|-------|------------|
| COGS scales to 25% | High | Based on provider negotiations |
| €80 end-user ARPU | Medium | Single Roblox game data point |
| 5% user conversion | Medium | Industry benchmark |
| 1.8% → 5% dev conversion | Low | Requires tier gating |

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ARPU lower than €80 | High | More games data, A/B testing |
| COGS doesn't scale | High | Provider negotiations ongoing |
| Conversion stays at 1.8% | Medium | Tier gating, feature limits |

---

## Investor Talking Points

1. **Zero CAC** - All growth organic, community-driven
2. **75% Gross Margin** - Industry standard for API businesses
3. **Immediate Payback** - Prepaid model, no credit risk
4. **Strong Retention** - 44% W4 retention for API product
5. **Clear Path to Profitability** - Break-even Mar 2026

---

*Document Status: DRAFT v1*  
*Last Updated: February 2, 2026*  
*Source: Financial Model + mycel-extract metrics*
