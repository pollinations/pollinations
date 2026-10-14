# Review of #17484 — NO-FIX

VERDICT: NO-FIX
ISSUES:
- None. The registry entry, available-model name, and OpenRouter configuration consistently identify the new model and route it to `/api/alpha/decisions`. The snapshot matches the declared input cost including the 5.5% fee and zero output cost; the narrowed Sonar assertion still checks that retired Sonar variants are absent while allowing the new Perplexity decision model.
PATCH: none
