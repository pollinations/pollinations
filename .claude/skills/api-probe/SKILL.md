---
name: api-probe
description: Diagnose Pollinations API health, latency, and auth errors against gen.pollinations.ai. Use when a pollinations call is failing, returning 401/403/429/5xx, feeling slow, or before filing a bug — runs fast curl-based checks across image/text/audio/video endpoints.
allowed-tools: Bash(curl *), Bash(jq *), Bash(bash *), Read
---

# api-probe — diagnose gen.pollinations.ai

First tool to reach for when a Pollinations API call misbehaves. Runs a battery of minimal curl probes against `gen.pollinations.ai`, reports status + latency + body excerpt, and maps common failure signatures to likely causes.

## When to use

- User reports "pollinations is down / slow / returning 401 / empty response"
- Before filing an issue or paging anyone — prove it's a real outage vs a local config problem
- After rotating an API key to confirm it authenticates end-to-end
- As a warm-up check before a long generation job (model in registry, auth works, rate limit headroom)

## Quick reference

| Intent | Command |
|---|---|
| Full probe (all endpoints) | `scripts/probe.sh` |
| Single endpoint | `scripts/probe.sh text` / `image` / `audio` / `video` / `models` |
| With auth (sk_ key) | `POLLINATIONS_API_KEY=sk_... scripts/probe.sh` |
| Against a local backend | `BASE_URL=http://localhost:3000 scripts/probe.sh` |

## What it checks

For each endpoint: HTTP status, latency (ms), response size, first 200 bytes of body. Then flags:

- `401/403` → auth: key missing, wrong prefix (`pk_` vs `sk_`), or revoked
- `402` → out of pollen balance
- `404` on `/v1/models` → hitting the wrong host (`image.pollinations.ai` direct instead of `gen.`)
- `429` → rate limited; show `x-ratelimit-*` headers
- `5xx` → backend; dump `x-request-id` so you can correlate in logs
- Latency > 5s on text → upstream provider slow (Portkey-side, not our edge)
- Empty body, 200 OK → streaming response consumed by curl without `--no-buffer`; re-run with streaming-aware flags

## Endpoints probed (all against `gen.pollinations.ai` by default)

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/models` | GET | registry reachable, auth header accepted |
| `/image/models` | GET | image registry |
| `/v1/chat/completions` | POST | text path (tiny prompt, `max_tokens: 1`) |
| `/image/test?model=flux&width=64&height=64` | GET | image path (smallest possible) |
| `/audio/hi?voice=nova` | GET | audio path |
| `/v1/models?capability=video` | GET | video registry (no generation — that's expensive) |

## Gotchas

- **Primary host is `gen.pollinations.ai`**, not `image.pollinations.ai` or `text.pollinations.ai`. The latter are internal EC2 backends; hitting them directly bypasses auth and billing and will confuse diagnosis. See [AGENTS.md](../../../AGENTS.md).
- **Auth header is `Authorization: Bearer <key>`.** Use `sk_` for backend probes, `pk_` for frontend-flow probes. Don't mix.
- **Don't probe video generation** in this skill — each call burns pollen. The skill only lists video models.
- **For local dev**, set `BASE_URL=http://localhost:3000` (enter gateway port per [AGENTS.md](../../../AGENTS.md)).
- **Streaming endpoints** (`/v1/chat/completions` with `stream: true`) will look hung without `--no-buffer`; this skill always sets `stream: false` for probes.
- If `curl` exits non-zero with no status, it's DNS / TLS / network — not an API problem. Check `curl -v` output.

## Sample output shape

```
== gen.pollinations.ai probe (auth: sk_live_...) ==
GET  /v1/models                  200  184ms   12.4 KB
GET  /image/models               200   91ms    3.1 KB
POST /v1/chat/completions        200  612ms   178 B
GET  /image/test?model=flux...   200 1432ms   2.8 KB
GET  /audio/hi?voice=nova        200  890ms   18.3 KB
GET  /v1/models?capability=video 200   95ms    1.2 KB

all green
```

Failing example:
```
POST /v1/chat/completions        401   42ms    61 B   { "error": "invalid_api_key" }
→ auth: key missing/revoked. Rotate at https://enter.pollinations.ai
```

## Related

- Deeper internal diagnostics (logs, per-user errors, Tinybird): use the `model-debugging` skill (internal).
- GPU-service health (RunPod, GH200, Oracle): use the `monitor-services` skill (internal).
- Full API surface: [APIDOCS.md](../../../APIDOCS.md).
