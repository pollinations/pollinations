# Model Comparison: nomnom vs perplexity-fast vs gemini-search

## Test Results Summary

### Query 1: Open Source Company Valuations

**nomnom**
- ❌ Returned empty/no response
- Possibly hit rate limit or timeout

**perplexity-fast**
- ✅ Excellent structured response with table
- Specific companies: GitLab ($15B), MongoDB ($20B), Elastic ($10B+)
- Cited 6 sources with links
- Clean, scannable format

### Query 2: Discord Community Sizes

**nomnom**
- ✅ Very detailed, contextual response
- Provided tiered analysis (Mega/Established/Niche)
- Added valuable metrics beyond member count (10% rule, response time)
- Explained research methodology
- More narrative/conversational style

**perplexity-fast**
- ✅ Direct, fact-focused response
- Specific numbers: Midjourney (20.44M), Viggle (3.97M)
- Cited 8 sources
- More concise, news-style format

### Query 3: Developer Platform Growth (gemini-search earlier)
- ✅ Comprehensive with specific percentages
- Good balance of detail and readability
- No citations but thorough

---

## Model Characteristics

### nomnom ("NomNom by @Itachi-1824")
**Strengths:**
- Deeper analysis and context
- Explains reasoning and methodology
- Provides frameworks (tiers, rules of thumb)
- More conversational/educational

**Weaknesses:**
- Rate limiting issues
- Sometimes returns empty responses
- Slower response time
- No source citations

### perplexity-fast (Sonar)
**Strengths:**
- Always includes source citations [1][2][3]
- Consistent, reliable responses
- Excellent for fact-checking
- Clean, structured format
- Fast response time

**Weaknesses:**
- Sometimes too brief
- Less contextual analysis
- Can miss nuance

### gemini-search
**Strengths:**
- Good balance of detail and brevity
- Handles complex queries well
- Reliable, no rate limits observed
- Good for exploratory research

**Weaknesses:**
- No source citations
- Sometimes verbose

---

## Recommendations

### Use **perplexity-fast** when:
- You need cited sources for investors
- Fact-checking specific claims
- Quick validation of metrics
- Building reference documents

### Use **nomnom** when:
- You want deeper analysis
- Understanding methodology matters
- Need contextual frameworks
- Rate limits aren't an issue

### Use **gemini-search** when:
- General research without citation needs
- Exploring broad topics
- Need reliable, consistent results
- Perplexity is too brief

---

## For Your Pitch

**Best approach:** Use perplexity-fast to validate key metrics (gets you citations), then use nomnom or gemini-search for deeper context and analysis. The combination gives you both credibility and depth.