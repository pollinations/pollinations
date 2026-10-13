# Cost table — three demo runs, model `openai/gpt-6.1-sol`

Date: 2026-10-13. Rates from `GET /v1/models` (catalog), currency pollen,
fetched 2026-10-13:

| rate key | per-token rate (pollen) |
|---|---|
| promptTextTokens | 0.000002 |
| promptCachedTokens (read) | 0.0000001 |
| promptCacheWriteTokens (write) | 0.0000025 |
| completionTextTokens | 0.00001 |

Usage is the provider-returned `usage` object, saved verbatim in
`run-<pr>.json` (`model_served: gpt-6.1-sol` in all three — the model-use
evidence). No cached-read tokens in any run. Reasoning tokens are inside
`completion_tokens` and billed once at the completion rate (no double
count).

## Standard computation: prompt x rate + completion x rate

| run | prompt | completion | cost (pollen, estimated) |
|---|---|---|---|
| #17233 review call | 1030 | 450 (of which 138 reasoning) | 1030 x 0.000002 + 450 x 0.00001 = **0.00656** |
| #17183 review call | 1086 | 460 (of which 104 reasoning) | 1086 x 0.000002 + 460 x 0.00001 = **0.006772** |
| #17241 review call | 1076 | 404 (of which 121 reasoning) | 1076 x 0.000002 + 404 x 0.00001 = **0.006192** |
| total (3 calls, 0 retries, 0 failures) | 3192 | 1314 | **0.019524** |

## Cache-write ambiguity (disclosed, not folded into the total)

Each call also reports `cache_write_tokens` (~entire prompt: 1027 / 1083 /
1073). The catalog lists a separate write rate (0.0000025), but the
provider does not document whether written tokens are billed INSTEAD OF
or IN ADDITION TO the prompt rate. If additive, add:

- #17233: 1027 x 0.0000025 = 0.0025675
- #17183: 1083 x 0.0000025 = 0.0027075
- #17241: 1073 x 0.0000025 = 0.0026825
- total upper bound: 0.019524 + 0.0079575 = **0.0274815 pollen**

No failed or retried billable calls occurred in any run (all three calls
returned on the first attempt), so there is nothing else to attribute.
Tool/computer MCP cost: none (reviews ran via direct API calls; no MCP
usage billed). Wall-clock: ~60-75s per call (time kept separate from
token cost, per protocol).

Pre-run prompt-tuning cost (reading quest, Sol consults, fetching diffs):
not metered here and excluded from the per-review table by design.
