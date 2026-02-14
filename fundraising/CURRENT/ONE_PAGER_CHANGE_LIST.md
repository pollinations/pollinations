# One-Pager v5 — Change List
> Cross-referenced against Feb 9 (Susanne) meeting, Feb 10 (Kalam) meeting, and Data Verification Report
> Date: February 10, 2026

---

## CRITICAL — Factual Errors

### 1. "Enterprise AI is too expensive to start with"
- **Issue:** fal.ai is pay-per-use with no minimums. The barrier is complexity, not cost.
- **Fix:** → "Enterprise AI requires API keys, backends, and billing systems to get started."

### 2. "Consumer tools have no APIs"
- **Issue:** HuggingFace has inference APIs. ChatGPT has an API.
- **Fix:** → "Consumer tools are walled gardens — no way to build on top of them."

### 3. "Fal, Replicate, OpenRouter charge developers"
- **Issue:** Replicate was acquired by Cloudflare (Nov 2025). Listing them as active competitor is stale.
- **Fix:** Drop Replicate → "Fal, OpenRouter, and others charge developers."

### 4. OpenRouter missing from competitor table
- **Issue:** Text mentions OpenRouter ($500M, ~8 people) but the table only shows HuggingFace, fal.ai, Pollinations.
- **Fix:** Add OpenRouter column (Role: LLM aggregator, Revenue: Usage fees / Charges devs).

---

## HIGH — Violates Meeting Decisions

### 5. Header: "Developers Build Free. Users Pay."
- **Source:** Susanne (Feb 9) — "Remove 'who's paying' from the first slide."
- **Issue:** The headline IS literally "who pays."
- **Fix:** Lead with USP → e.g. "The open-source AI platform for creators" or "One API. All models. Community-powered."

### 6. "Open source" missing entirely
- **Source:** Susanne (Feb 9) — "First slide must include USP buzzwords: open source, community-driven, AI platform."
- **Issue:** The phrase "open source" appears zero times on the one-pager.
- **Fix:** Add to header/subtitle. This is a core differentiator.

### 7. Terminology inconsistency
- **Source:** Kalam (Feb 10) — "Standardize on 'creators'."
- **Issue:** Uses "developers" (8x), "builders" (2x), "devs" (4x), "creators" (2x) interchangeably.
- **Fix:** Primary term = "creators." "Developers" as occasional synonym only.

### 8. Team buried in bottom-right
- **Source:** Kalam (Feb 10) — "Team positioning leads pitch structure."
- **Issue:** Team is a tiny section with no emotional hook. Thomas's founder quote is missing.
- **Fix:** Make team more prominent. Add Thomas's quote: "I built this because I needed it at 16."

### 9. Problem section starts with traction
- **Source:** Susanne (Feb 9) — "Lead bottom-up from the builder's pain."
- **Issue:** Opens with "600 developers join us every day" — that's traction, not pain.
- **Fix:** Start with the pain: "Every week, a new wave of creators ships AI apps... but the moment they get traction, they hit a wall."

---

## MEDIUM — Missing Content

### 10. No unit economics
- **Issue:** Business Model has no numbers. Investors need: take rate, margin, CAC.
- **Fix:** Add: "Take rate: 4% of GMV · Target gross margin: 75% · CAC: ~$0 (organic/community)"

### 11. No founder quote
- **Issue:** Thomas's quote is the emotional anchor. Present in the deck but missing here.
- **Fix:** Add: *"I built this because I needed it at 16. No credit card, no access — so the next generation doesn't face those barriers."*

### 12. "3M+ end-users/mo" without qualifier
- **Issue:** Without "(across developer apps)" an investor thinks these are direct platform users.
- **Reality:** Actual platform WAU is ~4,188 (DATA_VERIFICATION_REPORT). The 3M is indirect.
- **Fix:** → "3M+ end-users/mo (across developer apps)"

### 13. "600+ new devs/day" — unverified
- **Issue:** DATA_VERIFICATION_REPORT says actual signups ~2,888/week (~412/day).
- **Fix:** Either verify the 600+ figure or soften to "400+" or "hundreds daily."

---

## LOW — Structural / Polish

### 14. "1,000+" appears 4 times
- **Locations:** Subtitle, traction bar, Why We Win, Defensibility.
- **Fix:** Reduce to 2 occurrences max. Feels repetitive on one page.

### 15. Defensibility section redundant with Why We Win
- **Issue:** Both make the same points (1,000+ apps, switching costs, community).
- **Fix:** Merge, or make Defensibility about network effects only.

### 16. Two-sided pain not clear enough
- **Issue:** User pain ("subscription hell") is buried inside the developer Problem section.
- **Fix:** One sentence for builders, one for users — make the two sides explicit.

### 17. Missing growth chart
- **Source:** Susanne (Feb 9) asked for "the hockey stick."
- **Fix:** Add growth chart or at minimum note where it should go.

### 18. Contact email is hello@myceli.ai
- **Issue:** Minor — confirm this is the intended investor contact vs. pollinations.ai address.

---

## Summary: Quick Wins vs. Structural

**Quick wins (text edits only):**
- Fix #1, #2, #3 (factual corrections — 3 sentences)
- Fix #4 (add OpenRouter to table)
- Fix #6 (add "open source" somewhere)
- Fix #7 (find-replace terminology)
- Fix #10 (add unit economics line)
- Fix #12 (add qualifier to 3M)

**Structural (layout changes):**
- Fix #5 (new headline)
- Fix #8 (reposition team, add quote)
- Fix #9 (rewrite Problem opening)
- Fix #15 (merge Defensibility into Why We Win)
- Fix #17 (add growth chart)

---

*Reference: Pitch_v5_CLEAN.md has the corrected versions of most of these.*
