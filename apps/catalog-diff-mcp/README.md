# Catalog Diff MCP

Stateless MCP server that turns Pollinations catalog observations into
deterministic, timestamped model-change records — without making agents
reconstruct them.

## Tools

| Tool | Contract |
|---|---|
| `get_catalog` | Fetches `GET /v1/models` and returns a normalized snapshot: `snapshot_id`, `source`, `observed_at`, `model_count`, `models`. |
| `diff_catalog` | Compares a caller-supplied baseline snapshot (from `get_catalog`) against a freshly fetched catalog. Returns `added`, `removed`, and field-level `changed` entries. |

## History limits (read before promising dates)

- **No history is retained server-side.** There is no D1, KV, cron, or
  process-memory state. Every comparison is baseline-supplied.
- Describe results as *snapshot-to-snapshot comparison*, never as
  "changes since any date".
- An unusable baseline returns `history_unavailable` with a reason. The
  server never substitutes another baseline silently.
- A fresh fetch that is invalid **or empty** is an error, never a diff:
  an empty current catalog would manufacture mass removals, so
  `diff_catalog` fails fast instead (`catalog_empty`, `invalid_catalog`,
  `fetch_failed`).

## Freshness and scope

- One canonical surface: `GET /v1/models` (OpenAI-compatible list).
- `observed_at` is stamped after a successful fetch+parse; both baseline
  and current observation times are returned in every diff.
- Compared fields are authoritative structured entry fields only
  (`title`, `description`, `pricing`, `capabilities`,
  `supported_endpoints`, modalities, `context_length`, … — see
  `COMPARABLE_FIELDS` in `worker.js`). Volatile `health` and derived
  `tags` are excluded. Missing metadata is reported as missing, never
  as zero.
- Bounds: 15 s fetch timeout, 1 retry (network/5xx only), 5 000-model cap.
  The cap applies to the fresh catalog and to caller-supplied baselines;
  duplicate model ids are rejected on both sides.

## Example

Baseline snapshot (abbreviated, from `get_catalog`):

```json
{
  "snapshot_id": "baseline-snap-001",
  "source": "https://gen.pollinations.ai/v1/models",
  "observed_at": "2026-10-10T00:00:00.000Z",
  "models": [
    { "id": "openai/gpt-x", "description": "Old description", "pricing": { "prompt": 1, "completion": 2 } },
    { "id": "gone/model", "description": "Removed upstream" },
    { "id": "steady/model", "description": "Unchanged" }
  ]
}
```

Fresh catalog adds `brand/model-new`, drops `gone/model`, and edits
`openai/gpt-x`. `diff_catalog` returns:

```json
{
  "status": "ok",
  "added": [{ "id": "brand/model-new", "...": "full normalized entry" }],
  "removed": [{ "id": "gone/model", "...": "full normalized entry" }],
  "changed": [
    {
      "id": "openai/gpt-x",
      "changes": [
        { "field": "description", "baseline": "Old description", "current": "New description" },
        { "field": "pricing", "baseline": { "prompt": 1, "completion": 2 }, "current": { "prompt": 1, "completion": 3 } }
      ]
    }
  ],
  "counts": { "added": 1, "removed": 1, "changed": 1 },
  "history": "Snapshot-to-snapshot comparison …; not instantaneous truth.",
  "history_unavailable": false
}
```

## Deployment

Same pattern as `apps/ask-jev-mcp`: Streamable HTTP, stateless, bearer
API key required, no batch requests.

```bash
npm run test            # node --test worker.test.js (mocked upstream fetch)
npm run deploy:staging
npm run deploy
```

## Billing

`downstream` (ask-jev precedent): the caller's API key is forwarded to
the catalog fetch, discovery and calls carry no additional MCP fee —
catalog data is public and the tool performs no billable generation.
No `usage_receipt` is emitted and no upstream cost is invented.
