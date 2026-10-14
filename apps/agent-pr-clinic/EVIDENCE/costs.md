# Cost table — four demo runs, model `openai/gpt-6.1-sol`

Date: 2026-10-14. Rates from `GET /v1/models` (catalog), currency pollen:

| rate key | per-token rate (pollen) |
|---|---|
| promptTextTokens | 0.000002 |
| promptCachedTokens (read) | 0.0000001 |
| promptCacheWriteTokens (write) | 0.0000025 |
| completionTextTokens | 0.00001 |

Usage is the provider-returned `usage` object, saved verbatim in `run-<pr>.json`
(`model_served: gpt-6.1-sol` in all four — the model-use evidence). No retries, no failures.

| run | verdict | prompt | completion | cache-write | cost (pollen) |
|---|---|---|---|---|---|
| #17484 | NO-FIX | 1669 | 308 | 1666 | 1669 x 0.000002 + 308 x 0.00001 = **0.006418** |
| #17447 | NO-FIX | 933 | 277 | 0 | 933 x 0.000002 + 277 x 0.00001 = **0.004636** |
| #17422 | NO-FIX | 1786 | 273 | 1783 | 1786 x 0.000002 + 273 x 0.00001 = **0.006302** |
| #17453 | FIX | 1610 | 1051 | 1607 | 1610 x 0.000002 + 1051 x 0.00001 = **0.013730** |
| **total (4 calls)** | | | | | **0.031086** |

## Cache-write ambiguity (disclosed, not folded into the total)

Three runs also report `cache_write_tokens` (~the whole prompt). The catalog lists a
separate write rate (0.0000025), but the provider does not document whether written
tokens are billed INSTEAD OF or IN ADDITION TO the prompt rate. If additive, add:

- upper bound total: 0.031086 + 0.012640 = **0.043726 pollen**

Wall-clock per review: 7-22 s, kept separate from token cost.
