# Verification evidence

Verified 2026-09-30 against the deployed private agent. The two archived outputs are synthetic fixtures; the three agent calls, Jev decisions and Nano answers are genuine production responses.

- Public source: https://github.com/ale-rls/jev-context-trimmer
- Callable model: `community/ale-rls/jev-context-trimmer` (private, owner-callable).
- Dashboard-confirmed deployed source: `c4a0d64`; the verified runs used this deployed revision. Afterward, the three source files received formatting-only changes to match Pollinations’ four-space Biome configuration; no behavior changed.
- Local checks: eight tests, strict TypeScript, Biome and whitespace checks pass. Tests import the deployed agent implementation and exercise preservation, exclusion, task reversal, empty archives, malformed probabilities, size limits and upstream failures.
- Live assertions: all expected retained IDs and exact retained strings passed. No retries or failed generation calls occurred.

| Task over the same two outputs | Billing relevance | Weather relevance | Retained | Removed UTF-16 code units |
| --- | ---: | ---: | --- | ---: |
| Billing test question | 0.98 | 0.02 | billing_test | 119 / 247 |
| Paris weather question | 0.01 | 0.96 | paris_forecast | 128 / 247 |
| Unrelated novel question | 0.01 | 0.01 | none | 247 / 247 |

The billing answer identifies `test_charge` and expected 12 versus observed 11. The weather answer reports rain, 17°C and 12 km/h with picnic advice. The unrelated answer explicitly reports insufficient archived evidence rather than inventing a source. These are context-selection checks, not a general relevance benchmark or a token-savings claim.

[Full reproducible inputs, responses, decision IDs, reported usage and sanitized billing events](examples/live-2026-09-30.json).

Reported usage totals: Jev 1,806 input / 123 output tokens; Nano 360 input / 212 output tokens. Jev bills input only. The agent reports the combined token usage while underlying requests are billed through the caller's account.

## Measured request cost

The signed-in usage UI, filtered to the temporary proof key, showed **0.000333 Quest Pollen** and **0 Paid Pollen** for the three runs. Six exported billing events sum to **0.00033279** in the CSV's `cost_usd` column. UI and CSV event costs are rounded; this is displayed/exported precision, not an unrounded ledger amount. Costs are observed charges, not a reconstructed model-price formula. No account balance, key identifier or secret is published here.

A generation-only key capped at 0.05 Pollen with one-day expiry allowed only Jev, Nano and this private agent. Temporary local secret material was removed after verification; the user's configured expiry remains in effect.

Quest acceptance, merging and reward credit remain unconfirmed.
