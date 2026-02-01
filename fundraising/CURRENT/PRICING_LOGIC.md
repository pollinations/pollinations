# 💰 Pricing Logic & Assumptions

> **⚠️ DRAFT v1 - For Internal Review Only**

**Created**: February 2, 2026  
**Source**: Notion "Pollen - Pricing & Billing" + Financial Model  
**Status**: DRAFT - Needs Finance Review

---

## Core Pricing Philosophy

### What We Sell
- **Product**: AI Gen Media services (dialogue, image, reasoning, voice, video)
- **Unit**: Pollen credits (prepaid, per-use)
- **Model**: User-pays (end-users cover their own AI usage)

### Key Principles
1. **Under-market pricing** - Below consumer market rates
2. **Price stability** - Scheduled reviews only, reductions only
3. **Predictable costs** - Model buckets smooth provider price swings
4. **No surprise charges** - Free allocations drive adoption

---

## Pricing Structure

### Pollen Credit System

| Tier | Price per Pollen | Value |
|------|------------------|-------|
| **Standard** | $1 = 1 Pollen | ~5,000 image generations |
| **Bulk (10+)** | $0.90/Pollen | 10% discount |
| **Bulk (100+)** | $0.80/Pollen | 20% discount |

### Model Buckets (Simplified)

| Bucket | Models Included | Pollen/Request | Notes |
|--------|-----------------|----------------|-------|
| **Image Basic** | flux-schnell, turbo | 0.0002 | Fast, good quality |
| **Image Pro** | flux-dev, flux-pro | 0.001-0.005 | High quality |
| **Text Basic** | mistral, llama | 0.00001/token | Fast inference |
| **Text Pro** | gpt-4, claude | 0.0001/token | Best quality |
| **Audio** | whisper, TTS | 0.001/second | Speech services |
| **Video** | Coming soon | TBD | Gated to paid tiers |

### Free Tier Allocation

| User Type | Daily Pollen | Notes |
|-----------|--------------|-------|
| **Anonymous** | 10 | No signup required |
| **Registered** | 50 | GitHub login |
| **Flower Tier** | 100 | Active contributors |
| **Garden Tier** | 500 | Top contributors |

---

## Revenue Model

### Revenue Streams

| Stream | Current | Q2 2026 | Q4 2026 | Mechanism |
|--------|---------|---------|---------|-----------|
| **Dev Top-Ups** | $6K/mo | $40K/mo | $70K/mo | B2B credit purchases |
| **End-User Pollen** | $0 | $80K/mo | $460K/mo | User-pays via apps |
| **Ads/Sponsorship** | $0 | $10K/mo | $100K/mo | Model provider placements |

### Take Rates

| Transaction Type | Take Rate | Notes |
|------------------|-----------|-------|
| **Pollen GMV** | 4% | Payment processing |
| **Ads Revenue** | 15% | Network fee |
| **Developer Payouts** | 0% | We don't take from developer earnings |

---

## Cost Structure (COGS)

### Current Costs (Jan 2026)

| Category | Monthly Cost | Notes |
|----------|--------------|-------|
| **AI Inference** | ~$35K | Model providers (FAL, Together, etc.) |
| **Infrastructure** | ~$3K | Cloudflare, AWS |
| **Observability** | ~$2K | Logging, monitoring |
| **Total COGS** | ~$40K | Fixed until monetization |

### Post-Monetization COGS (Mar 2026+)

| Component | % of Revenue | Notes |
|-----------|--------------|-------|
| **AI Inference** | 20% | Volume discounts kick in |
| **Infrastructure** | 3% | Scales efficiently |
| **Platform** | 2% | Orchestration, storage |
| **Total COGS** | ~25% | Target gross margin: 75% |

---

## Pricing Assumptions

### Key Assumptions

| Assumption | Value | Basis |
|------------|-------|-------|
| **Gross Margin** | 75% | Industry standard for API businesses |
| **ARPU (End Users)** | €80/month | Based on Roblox game data |
| **ARPU (Developers)** | €30/month | Current top-up patterns |
| **Conversion Rate** | 5% → 10% | Free to paid |
| **Price Elasticity** | Low | Users value convenience over cost |

### Pricing Guardrails

| Guardrail | Rule |
|-----------|------|
| **Price Floor** | Never below COGS ÷ target GM |
| **Price Changes** | Reductions only (except new buckets) |
| **Kill Switch** | If bucket breaches floor, re-SKU |

---

## Competitive Pricing Comparison

| Service | Image Gen Cost | Text (1K tokens) | Notes |
|---------|----------------|------------------|-------|
| **Pollinations** | ~$0.0002 | ~$0.00001 | Free tier available |
| **FAL.ai** | ~$0.001 | N/A | Enterprise focus |
| **Replicate** | ~$0.002 | ~$0.0001 | Acquired by Cloudflare |
| **OpenAI** | N/A | ~$0.01 | GPT-4 pricing |

**Our Position**: 5-10x cheaper than alternatives with better developer experience.

---

## Efficiency Levers

### Current
- Cloud credits from providers → generous free Pollen
- Semantic caching → reduce redundant inference

### Planned
- Provider volume discounts (FAL, Together)
- Reserved capacity agreements
- Smaller model fallbacks for simple requests
- Custom fine-tunes for common use cases

---

## Pricing Review Process

1. **Frequency**: Quarterly reviews
2. **Direction**: Prices only move down
3. **New Capabilities**: Launch new bucket (don't increase existing)
4. **Change Log**: Document all changes with rationale

---

## Open Questions

- [ ] Validate €80 ARPU assumption with more Roblox data
- [ ] Determine video pricing (currently gated)
- [ ] Finalize enterprise tier pricing
- [ ] Set up A/B testing for price sensitivity

---

*Document Status: DRAFT v1*  
*Last Updated: February 2, 2026*  
*Source: Notion "Pollen - Pricing & Billing"*
