# Bee storage backends

Bee storage has two layers:

- **Hot state** is used during requests. It needs low latency and clear
  ownership.
- **Cold/archive memory** is exported or reviewed outside the request path. It
  needs portability, auditability, and human-readable history.

## Hot state

`state.backend` is for hot state only:

| backend | use when |
|---|---|
| `sqlite` | default; portable across local dev, Cloudflare DO SQLite, and containers |
| `durable-object` | Cloudflare-native state when SQL tables are not needed |
| `kv` | small config, cache, or low-write shared state |
| `memory` | tests, demos, and ephemeral container sessions |

Missing `state.backend` resolves to `sqlite`.

## Cold/archive memory

GitHub is a good archive target, not a hot state backend.

Good fits:

- versioned memory summaries as Markdown or JSON files;
- agent knowledge/config files with commit history;
- Issues or Discussions for project/task memory;
- PR-based updates when memory or tool config should be reviewed before merge;
- user-exportable memory snapshots.

Bad fits:

- high-frequency chat history writes;
- low-latency retrieval;
- private PII-heavy runtime state;
- concurrent request-time mutation.

Docs-only strawman:

```json
{
  "memory": {
    "archive": {
      "provider": "github",
      "repo": "owner/repo",
      "path": "bees/memory/booking-assistant"
    }
  }
}
```

Do not add `state.backend = "github"` until a GitHub archive proof exists. Use
GitHub App installation tokens with narrow repository permissions; sandboxed bee
code should not receive user PATs.

## Fly.io follow-up

Fly.io belongs in the `container` lane. Fly Machines plus Volumes can run a
portable SQLite file at a path like `/data/bee.sqlite`; LiteFS is the follow-up
option when replicated SQLite is needed.

Keep Fly under `runtime.provider = "container"` for now. Add a first-class
`fly` provider only after a `minimal-fly-sqlite-container` proof shows that the
deployment UX is better than generic containers.
