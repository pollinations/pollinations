# prism code-review router

`prism` is a [code agent](../../../BUILD_YOUR_OWN_AGENT.md) that routes every request to the right model, then answers as that model. It is tuned for engineering work — PR review, debugging, architecture, security, operations, data — and still routes everyday questions, documentation, planning, and creative work.

Fixes [pollinations/pollinations#15017](https://github.com/pollinations/pollinations/issues/15017).

## Why routing decisions stay local

Most routers spend one LLM call deciding which LLM to call. Prism classifies locally with deterministic signals (keyword families, diff hunk counts, payload size, modality detection) because that decision:

- adds zero model-call cost and zero extra latency;
- keeps the full request payload (including unreleased diffs) out of a second model's context;
- is auditable — every route can be traced to explicit rules instead of a classifier's mood.

The trade-off: no semantic understanding of the task. Prism compensates by escalating on cheap, high-recall signals (security vocabulary, diff size, request size) rather than trying to be clever about "difficulty".

## Routing policy

Before anything else, the router reads the caller's pollen wallet (`GET /account/balance`, forwarded with the caller's own credentials) and derives a per-request spend cap: `balance / 2`. Every later decision respects that cap. If the balance isn't visible (budgeted keys always report it; unbudgeted keys without `account:usage` get 403), routing proceeds uncapped — a privacy-limited wallet never breaks routing.

Tier selection, in evaluation order:

| Condition | Tier | Why |
| --- | --- | --- |
| Security vocabulary (auth, secrets, injection, CVE, crypto…) | deep | misses here cost real money; over-escalation is cheap |
| Code review + architecture/migration/concurrency signals | deep | architectural PR analysis |
| Ops + deep signals (deploys, k8s, incidents…) | deep | high-impact systems work |
| Request > 24k chars | deep | large-context request |
| Unified diff payload (≥2 hunks or ≥20 diff lines) + deep signals | deep | diff-driven review, not keyword noise |
| Code review / PR / diff / failing tests | balanced | normal review depth |
| Deep signals on small payloads | balanced | single "performance" word shouldn't burn flagship tokens |
| Planning/spec/ADR or ops tasks | balanced | multi-step, moderate depth |
| Code/data tasks | balanced | multi-step engineering |
| Everything else (docs, writing, short questions) | fast | one-shot answers |

Model selection then filters the live catalog:

1. **Hard gates** — drops models that are unhealthy (explicit `down`/`degraded` catalog status, success rate <95% on a real sample, >10% 5xx in the last 30 min on `/models/status`, or a status row where every request failed; rows with <10 requests are ignored as noise, and *unproven* models with no traffic are allowed), that don't support the stateless Responses API (`supported_endpoints` — community/proxy models often don't), that can't fit the estimated context (chars/3 + 4k margin), that lack text/image input modality when needed, or that lack `tool_calling` when the request needs tools.
2. **Wallet cap** — models whose estimated cost for this request (prompt tokens from actual payload size + completion tokens from `max_output_tokens`, default 500) exceed the spend cap are dropped before ranking. If *nothing* fits, the router picks the cheapest eligible model: the caller either gets an answer that squeaks under budget or a clean gateway 402 instead of a surprise drain. Capping is visible in the trace (`wallet-capped (balance 2, max spend 1.0000)`).
3. **Free-community preference (fast/balanced)** — when any healthy free community model qualifies, it wins: free listings cost the caller zero pollen, and if one degrades it fails the health gate on the next request, so the router automatically switches to the next-best (verified live: a community model serving 41 requests with 0 successes is dropped and the paid model is picked). When no free model qualifies, the paid pool is ranked by live token price: lowest for fast, median for balanced (median avoids both toy models and accidental flagships).
4. **Deep tier pays for quality** — among affordable models, ranks by reasoning capability, then context length, then listed price (flagship proxy). Deep is deliberately the tier where paying for strength is allowed; the wallet cap, not a free preference, protects affordability. If nothing is reasoning-capable, the largest-context model wins.

The router also:

- injects `reasoning_effort` (`high`/`medium`) only when the caller didn't set one and the routed model supports it; strips the field when the routed model can't honor it;
- appends an engineering rubric to non-fast requests: facts vs hypotheses, security/regression/concurrency/data-loss priorities, file-and-hunk citations, confidence levels, risks, rollback, verification, edge cases;
- forwards the original conversation unchanged otherwise — no reordering, no rewriting.

## Robustness

- **Catalog failures** fall back to a deterministic tier→model table (`gpt-5.4-nano` / `gemini-3.8-flash` / `grok-4.3`) instead of throwing; a routing outage never fails the caller's request.
- **Malformed bodies** are forwarded verbatim so the gateway returns its own proper validation errors.
- **Catalog cache** (60 s per isolate) keeps routing fast without stale-for-minutes health data.
- **Billing/auth** stay on the platform path — `pollinations(path)` calls use the caller's delegated authority; no keys, no retries that could double-charge.

## Observability

Each request logs one JSON line and sets response headers:

```
x-pollinations-router: prism
x-pollinations-router-model: <selected model id>
x-pollinations-router-tier: fast | balanced | deep
x-pollinations-router-reason: <classification>; <selection>; catalog=live|fallback; balance=<n|private>
```

The caller's balance is included so wallet-capped routes are auditable; keys that hide their balance show `balance=private`.

Note: gateway conversions can strip custom headers on Chat Completions; the trace is designed to be checked on `/v1/responses` and via worker logs.

## Supported workloads

PR/diff review, debugging, failing tests, API/SDK work, dependency upgrades, architecture, migrations, refactors, security audits, performance and concurrency, databases and data pipelines, analytics, Docker/Kubernetes/Terraform/cloud, CI/CD, incidents and postmortems, technical specs and roadmaps, documentation and translation, research synthesis, creative and product copy.

## Demo matrix

Live-verified routes (test API key, balance 2 pollen):

| Request | Tier | Routed to | Why |
| --- | --- | --- | --- |
| `what does this function return? function f(x) { return x * 2 }` | fast | `community/YoannDev90/agentic-gt` | small coding request; healthy free community model — 0 pollen |
| `review this PR diff for regressions` + diff body | balanced | `community/YoannDev90/agentic-gt` | code review context; free community model preferred |
| `audit this oauth migration for race conditions and security issues` | deep | `openai/gpt-6-astra` | security-sensitive; strongest affordable (reasoning, 1.05M ctx) |
| `design a technical plan… for migrating our webhook delivery to a queue` | balanced | `community/YoannDev90/agentic-gt` | planning work; free community model preferred |

Degradation switchover is covered by a zero-spend check against `choose()`: a healthy free community model wins the fast tier, and the same model with a status row of 41 requests / 0 successes is dropped in favor of the paid model — "switch when one degrades", no config needed.

## Register and call

The deployable source is the root-level `agent.ts` in [the source repository](https://github.com/cesus-agent/prism-code-review-router). Register it as a code agent (My Models → Add Agent → Code agent), then call it like any model:

```bash
curl https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"cesus-agent/prism-code-review-router","input":"Audit this OAuth migration for race conditions and security issues.","store":false}'
```

Routing evidence is in the response: the `model` field of the answer plus the `x-pollinations-router-*` headers and the worker's JSON log line.
