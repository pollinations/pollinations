---
name: provider-billing
description: Query billing, usage, credits, and resource deployments across all our cloud and SaaS providers (Azure, AWS, Cloudflare, GCP, Tinybird, Vercel, Stripe, Polar, etc.) via their native CLIs and APIs. Use for any question about provider costs, spend by service/day/month, credit eligibility, invoice totals, which resources are running, or how to deploy/inspect resources. Each provider has a dedicated playbook under `providers/`.
---

# Provider billing knowledge base

This skill captures the exact CLI and REST calls needed to answer cost, usage, credit, and deployment questions for every provider we use. It is a **meta-skill**: the umbrella loads here, then you open the specific provider playbook from `providers/<name>.md` based on the question.

The goal is simple: **never re-derive a billing API shape twice.** Every time we learn a new gotcha — wrong param name, missing permission, weird regional naming — it gets captured in the relevant provider file.

## How to use

1. Identify which provider the question is about (Azure spend? AWS Cost Explorer? Cloudflare analytics? Stripe fees?)
2. Open the matching file under [providers/](providers/)
3. Follow the recipes there — they are validated and commented with the date they were verified
4. If the provider file doesn't exist yet, create it by copying the template below
5. If you learn a new gotcha during the session, update the provider file before finishing

## Available provider playbooks

| Provider | Playbook | Status | Last validated |
|---|---|---|---|
| Azure | [providers/azure.md](providers/azure.md) | ✅ Production | 2026-04-11 |
| AWS | [providers/aws.md](providers/aws.md) | ✅ Production (list prices, no credits visible) | 2026-04-11 |
| Umbrella Cost (Automat-IT reseller) | [providers/umbrella-cost.md](providers/umbrella-cost.md) | ⚠️ Auth validated, data plane blocked (API access gated at tenant). **Shows real invoiced AWS cost after reseller discount — supersedes `aws.md` for runway math once unblocked.** | 2026-04-11 |
| GCP / Vertex AI | [providers/gcp.md](providers/gcp.md) | ✅ Production — auth + inventory validated live. BigQuery billing export needs one-time Console enable before SKU-level queries work. | 2026-04-11 |
| Stripe (revenue + fees) | [providers/stripe.md](providers/stripe.md) | ✅ Production — balance, balance_transactions, fees. March 2026: €7,303 gross / €6,627 net. | 2026-04-11 |
| Polar.sh (subscriptions + MRR) | [providers/polar.md](providers/polar.md) | ✅ Production — `/metrics` endpoint, products, churn. ⚠️ `/metrics.revenue = 0` since Feb 2026 while Stripe shows €7k/mo — cross-check always. | 2026-04-11 |
| Wise (cash position) | [providers/wise.md](providers/wise.md) | ✅ Production — profiles + balances live. €58,594 in business EUR balance captured. ⚠️ Statement/transaction endpoints require SCA keypair (one-time openssl setup). | 2026-04-11 |
| RunPod (GPU shadow cost) | [providers/runpod.md](providers/runpod.md) | ✅ Production — live burn rate + credit balance via GraphQL. $2,071 credit remaining, $1.648/hr burn, ~52 days runway. No historical ledger (poll to reconstruct). | 2026-04-11 |
| Lambda Labs (GPU shadow cost) | [providers/lambda-labs.md](providers/lambda-labs.md) | ✅ Production — instances + price book live. $5.57/hr → ~$4,010/mo across 3 instances. ❌ Zero billing endpoints; shadow cost ONLY via polling + price book. | 2026-04-11 |
| Alibaba Cloud (Model Studio / DashScope) | [providers/alibaba.md](providers/alibaba.md) | ✅ Production — full BSS query flow. March net $224 (after $1k coupon), April MTD $704 (coupon depleted), run rate ~$2,745/mo. Per-model breakdown via InstanceID parsing. | 2026-04-11 |
| BytePlus (Seedance + Seedream) | [providers/byteplus.md](providers/byteplus.md) | ✅ Production — Model Ark `/api/v3/models` works, ❌ zero billing endpoints on the international tenant. Shadow cost via Tinybird `generation_event`; credit pool balance Console-only. | 2026-04-12 |
| Perplexity (Sonar web-search) | [providers/perplexity.md](providers/perplexity.md) | ✅ Production — `POST /chat/completions` is the only endpoint that exists. Every billing/usage/models path returns 404. Shadow cost via Tinybird; credit pool balance dashboard-only. | 2026-04-12 |
| Fireworks AI | [providers/fireworks.md](providers/fireworks.md) | ✅ Production — `firectl account get` for live balance, `billing export-metrics` for per-model CSV. $10k credit pool on `pollinations` account. | 2026-04-12 |
| Cloudflare | `providers/cloudflare.md` | ⏳ TODO | — |
| Tinybird | `providers/tinybird.md` | ⏳ TODO (see also `tinybird-deploy` skill for deploys) | — |
| Vercel | `providers/vercel.md` | ⏳ TODO | — |
| Vast.ai | `providers/vast.md` | ⏳ TODO | — |
| OVH | `providers/ovh.md` | ⏳ TODO | — |

## What each playbook must contain

Every provider file follows the same shape so they're comparable and composable:

1. **Requirements** — CLI tools, auth, env vars, permissions
2. **Known identifiers** — account IDs, subscription IDs, billing profiles, regions (real values, not placeholders)
3. **Query endpoints** — one section per endpoint (realtime usage, billed transactions, invoices, quotas, credit balance)
4. **Field semantics** — what each response field means, especially ambiguous ones
5. **Credit / discount handling** — how to tell what's covered by credits, MACC, sponsorship, etc.
6. **Deployment operations** — how to create/list/inspect/delete resources (if the provider hosts compute/models)
7. **Gotchas** — every wrong-param-name / permission-denied / regional-naming quirk we've hit
8. **Cheat sheet** — "Question → query" table at the end
9. **Known unknowns** — open questions and blockers (permission grants needed, unresolved provisioning errors, etc.)

## Template for a new provider

When you add a new provider playbook, copy this structure:

```markdown
# <Provider> billing via CLI

Validated: <YYYY-MM-DD>. Re-validate if a command returns unexpected results.

## Requirements
- CLI: `<cli-name>` installed and authenticated
- Python3 for JSON wrangling
- Any required environment variables or credentials

## Known identifiers (our account)
<Account / subscription / project / org IDs with real values>

## Querying spend and usage

### 1. <Endpoint name> — <latency / granularity>
<exact curl or CLI command with our identifiers pre-filled>
<sample output fields with semantics>

### 2. <Next endpoint>
...

## Credit / discount handling
<How credits apply, which fields show them, permission requirements>

## Deployment operations (if applicable)
<Create / list / inspect / delete commands>

## Gotchas
- <Specific error → root cause → fix>
- <...>

## Question → query cheat sheet
| Question | Endpoint | Example |

## Known unknowns
- <Blocker 1>
- <Blocker 2>
```

## Adding a new provider playbook

1. Create `providers/<name>.md` using the template above
2. Add the row to the table in this file
3. Fill in only what you **validated** in this session — don't guess at endpoints
4. If something is unverified, mark it `⚠️ UNVERIFIED` inline so the next session knows to check it

## Related skills

- [spending-analysis](../spending-analysis/SKILL.md) — Pollinations revenue side (Polar orders + Tinybird usage). Pair with this skill when answering "how much did we spend vs. how much did we earn."
- [tinybird-deploy](../tinybird-deploy/SKILL.md) — Tinybird deployment mechanics. This skill will eventually host the **cost** side of Tinybird.
- [enter-services](../enter-services/SKILL.md) — enter.pollinations.ai deployment. Related for EC2 and Cloudflare Worker spend questions.
