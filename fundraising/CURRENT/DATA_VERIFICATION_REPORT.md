# 🔍 Data Verification Report

> **⚠️ CRITICAL - Review Before Any Investor Communication**

**Created**: February 2, 2026  
**Purpose**: Cross-check all claims and data across fundraising documents  
**Status**: Issues Found - Requires Team Review

---

## 🚨 CRITICAL ISSUES FOUND

### Issue 1: MAU Metric Inconsistency

| Document | Claim | Source |
|----------|-------|--------|
| SCQA Framework | **3M+ MAU** | Line 84 |
| INVESTOR_QUESTIONS_ANSWERS | **3M users** | Multiple places |
| Story & Vision (Notion) | **20K users** | Jan 28 doc |
| mycel-extract/04_business_model | **WAU: 4,188** | Week of Jan 5, 2026 |

**PROBLEM**: "3M MAU" vs "20K users" vs "4,188 WAU" are wildly different numbers.

**LIKELY EXPLANATION**: 
- "3M MAU" may refer to **end-users of apps built on Pollinations** (indirect users)
- "20K users" may refer to **developers/platform users** (direct users)
- "4,188 WAU" is **weekly active developers**

**⚠️ ACTION REQUIRED**: 
1. Clarify which metric is which
2. Define clearly: "3M MAU across apps" vs "20K platform users" vs "4K WAU developers"
3. Update all documents with consistent terminology

---

### Issue 2: Competitor Data is OUTDATED

The competitor information in INVESTOR_QUESTIONS_ANSWERS.md and other docs is significantly outdated.

| Competitor | Our Documents | Actual (Feb 2026) | Source |
|------------|---------------|-------------------|--------|
| **FAL AI** | Not specified | **$4.5B valuation**, $200M+ revenue, $447M raised | TechCrunch Dec 2025 |
| **Replicate** | Listed as competitor | **ACQUIRED BY CLOUDFLARE** (Nov 2025) | TechCrunch, Crunchbase |
| **OpenRouter** | Not mentioned | **$40M raised**, $100M+ ARR, 1M+ developers | GlobeNewswire Jun 2025 |

**PROBLEM**: Our competitive positioning may be based on stale data.

**⚠️ ACTION REQUIRED**:
1. Update competitor analysis with current data
2. **Replicate acquisition is a major market signal** - discuss implications
3. Re-assess positioning against FAL ($4.5B) and OpenRouter ($100M ARR)

---

### Issue 3: Antler SAFE Terms - UNVERIFIED

| Claim | Document | Verification Status |
|-------|----------|---------------------|
| €300K investment | SAFE_CAP_DISCOUNT_RESEARCH.md | ⚠️ **NOT VERIFIED** in Notion |
| €5.07M post-money cap | SAFE_CAP_DISCOUNT_RESEARCH.md | ⚠️ **NOT VERIFIED** in Notion |
| ~5.9% ownership | SAFE_CAP_DISCOUNT_RESEARCH.md | ⚠️ **CALCULATED from unverified data** |

**PROBLEM**: I used these figures in dilution modeling, but I cannot find primary source verification.

**⚠️ ACTION REQUIRED**:
1. **Thomas to verify** actual Antler SAFE terms from legal documents
2. Confirm: Investment amount, cap, discount (if any)
3. Update SAFE_CAP_DISCOUNT_RESEARCH.md with verified numbers

---

### Issue 4: Discord Member Count Varies

| Document | Discord Count |
|----------|---------------|
| 15 Jan Meeting Notes | 13K |
| 15 Jan Meeting Notes (later) | 16K |
| Substack Article Notes | 17K |
| SCQA Framework | 17K+ |
| Story & Vision | 17K |

**ASSESSMENT**: Likely growing over time. **17K appears to be the most recent figure.**

**STATUS**: ✅ Minor - Use 17K as current figure, but verify current count.

---

### Issue 5: Apps Count Varies

| Document | Apps Count |
|----------|------------|
| SCQA Framework | 800+ |
| Substack Notes | 1K |
| Story & Vision | 1K |
| VALIDATED_METRICS | 1K |

**ASSESSMENT**: Likely growing. **1K appears to be the more recent figure.**

**STATUS**: ✅ Minor - Use 1K (or ~1,000) as current figure.

---

### Issue 6: Developer Count Definition

| Metric | Value | Source |
|--------|-------|--------|
| "600+ developers joining daily" | 600/day | Multiple docs |
| "5K developers building" | 5K total | Story & Vision |
| New Signups (Week Jan 5) | 2,888/week | mycel-extract |

**PROBLEM**: 600/day would be 4,200/week, but actual signups were 2,888/week.

**ASSESSMENT**: The 600+ may have been a peak period, or "developers" is defined differently from "signups."

**⚠️ ACTION REQUIRED**: Clarify current growth rate and use consistent terminology.

---

## ⚠️ MODERATE ISSUES

### Issue 7: Financial Model Assumptions

| Assumption | Value | Verification |
|------------|-------|--------------|
| Break-even | Mar 2026 | ⚠️ Depends on €80K Pollen GMV in first month |
| Mar 2026 GMV | €80K | ⚠️ Aggressive - requires 1000 paying users at €80 ARPU |
| Current revenue | $820/week | ✅ Verified (Jan 5 week) |
| Monthly burn | €25K OpEx + €40K COGS | ⚠️ COGS verified, OpEx needs confirmation |

**RISK**: Break-even projection depends on user-pays model launching successfully in March.

---

### Issue 8: Revenue Data Points

| Period | Revenue | Source |
|--------|---------|--------|
| Week of Jan 5, 2026 | $820 | mycel-extract |
| Roblox game (total) | $12K | Multiple docs |
| Monthly projection | €15K-€20K | Financial model (Jan-Feb) |

**STATUS**: ✅ Internally consistent - ~$820/week = ~$3.3K/month, which aligns with Dev Top-Ups in the model.

---

## ✅ VERIFIED DATA POINTS

| Data Point | Value | Status |
|------------|-------|--------|
| GitHub Stars | 3.8K | ✅ Verified |
| Roblox game visits | 51M | ✅ Consistent across docs |
| Roblox game revenue | $12K | ✅ Consistent across docs |
| Tokens used (Week Jan 5) | 10.9B | ✅ Verified |
| Weekly Active Users (Jan 5) | 4,188 | ✅ Verified |
| Conversion to paying | 1.8% | ✅ Verified |

---

## 📊 COMPETITOR LANDSCAPE UPDATE (Feb 2026)

### FAL AI (Major Competitor)
- **Valuation**: $4.5B (Dec 2025)
- **Funding**: $447M total ($140M Series D, Dec 2025)
- **Revenue**: $200M+ ARR
- **Team**: 92 people
- **Customers**: Adobe, Shopify, Canva, Quora
- **Focus**: Enterprise multimodal AI infrastructure

**Pollinations Position**: We target indie/hobbyist developers that FAL doesn't serve. Different market segment.

### Replicate → Cloudflare (Acquired Nov 2025)
- **Valuation**: $350M (at acquisition)
- **Funding**: $57.8M total
- **Revenue**: $1.2M (2024) - relatively low
- **Status**: **ACQUIRED BY CLOUDFLARE**

**Pollinations Position**: Replicate's acquisition validates the market. Their low revenue relative to funding suggests enterprise focus wasn't working. Our user-pays model is differentiated.

### OpenRouter (Rising Competitor)
- **Funding**: $40M (Jun 2025)
- **Revenue**: $100M+ ARR (as of May 2025)
- **Developers**: 1M+
- **Team**: 5 people

**Pollinations Position**: OpenRouter is a model aggregator (LLM focus). We're more full-stack (images, audio, video) with community focus. But their traction is impressive.

---

## 🎯 RECOMMENDED UPDATES

### High Priority (Before Investor Meetings)

1. **Clarify MAU definition** - "3M end-users across 800+ apps" vs "20K platform developers"
2. **Verify Antler SAFE terms** - Get exact cap and amount from legal docs
3. **Update competitor section** - Replicate acquired, FAL at $4.5B, OpenRouter at $100M ARR
4. **Confirm current growth rate** - Is it still 600+/day or lower?

### Medium Priority

5. **Standardize Discord count** - Verify current number (should be ~17K+)
6. **Standardize apps count** - Verify current number (should be ~1K)
7. **Review break-even assumptions** - Mar 2026 depends on aggressive GMV targets

### For Discussion

8. **How to position vs. FAL** ($4.5B) - different market segment story
9. **Replicate acquisition narrative** - market validation, why we're different
10. **OpenRouter comparison** - their 1M developers vs our community focus

---

## 📋 Verification Checklist

- [ ] Thomas: Confirm Antler SAFE exact terms (amount, cap, discount)
- [ ] Thomas: Verify current Discord member count
- [ ] Thomas: Verify current apps count
- [ ] Thomas: Clarify MAU vs WAU vs platform users terminology
- [ ] Thomas: Confirm current daily developer growth rate
- [ ] Elliot: Review financial model COGS and OpEx assumptions
- [ ] Team: Update competitor positioning in pitch materials

---

*Document Status: VERIFICATION REPORT*  
*Last Updated: February 2, 2026*  
*Action: Review and confirm all flagged items before investor communications*
