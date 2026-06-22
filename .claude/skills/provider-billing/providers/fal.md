# fal.ai billing via Platform REST API + CLI

Validated: **2026-06-22**. Re-validate if a command returns unexpected results.

fal.ai is a generative-media inference platform (image / video / audio / 3D),
pay-as-you-go, billed per output unit (flat per call for most models). We use it
for **Stable Audio 3.0 Medium** text-to-audio (added via PR #11912). Many models
we already run on Replicate (Wan, Seedance, Veo, Kling, FLUX, Ideogram, Qwen,
LTX) are *also* on fal — see the catalog notes at the bottom.

## Requirements

- **Auth:** a fal key in the format `<key_id>:<key_secret>` (UUID `:` hex).
  - Header is `Authorization: Key <FAL_KEY>` — note the literal `Key ` prefix,
    **not** `Bearer`. Wrong prefix → 401.
  - Clients read it from the `FAL_KEY` environment variable automatically.
  - Key scopes: **ADMIN** (full account + key/secret management) or **API**
    (runtime inference only). Use an **API**-scoped key for the gen worker
    runtime; keep ADMIN for management only.
- Tools: `curl` + `jq`. Optional: `fal` CLI + `fal-client` (`pip install fal`),
  or the JS client `@fal-ai/client`. **The `fal` CLI is NOT installed on this
  machine** (`command -v fal` → not found) — REST is the validated path here.
- Runtime secret lives (planned) in
  `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json` as `FAL_KEY`.

## Known identifiers (our account)

- One fal account, created 2026-06-22. Admin key id is a UUID (stored outside
  the repo during setup; runtime key goes to SOPS as `FAL_KEY`). Do not commit
  raw keys — SOPS only.

## Querying spend and usage

### 1. Cost estimate — `POST /v1/models/pricing/estimate` (validated ✅)

The only billing endpoint confirmed working as of 2026-06-22.

```bash
FAL_KEY=$(sops -d gen.pollinations.ai/secrets/prod.vars.json | jq -r '.FAL_KEY')
# (or, during setup, from a local 600-perm file)

curl -sS -X POST "https://api.fal.ai/v1/models/pricing/estimate" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "estimate_type": "unit_price",
    "endpoints": { "fal-ai/stable-audio-3/medium/text-to-audio": { "unit_quantity": 1 } }
  }'
# → {"estimate_type":"unit_price","total_cost":0.0376,"currency":"USD"}
```

- `estimate_type: "unit_price"` — price for N output units (`unit_quantity`).
- `estimate_type: "historical_api_price"` — projected cost for N **calls**
  (`call_quantity`) using each endpoint's recent average. Use it to sanity-check
  spend before a batch job.
- Multiple endpoints can be priced in one call (object keyed by model id).

**Validated unit prices (2026-06-22):**

| Endpoint | $/unit |
|---|---|
| `fal-ai/stable-audio-3/medium/text-to-audio` | **0.0376** |

> The public model page showed `$0.0417`; the API estimate returns `$0.0376`.
> Trust the API estimate — it's what we're actually billed.

### 2. Historical usage / spend over time

⚠️ **No public REST endpoint confirmed.** The billing dashboard
(https://fal.ai/dashboard/billing) shows total spend, invoices, and payment
history; per-model/request detail is in the dashboard's usage & analytics views.
For Pollinations operational attribution use Tinybird `generation_event`
(`model_provider = 'fal'`) once the model is live — same pattern as Replicate.

## Deployment / key operations (CLI — from docs, not run here)

```bash
fal auth login                      # browser auth; or set FAL_KEY env
fal keys create --scope API         # mint a runtime-scoped key (recommended)
fal keys list
fal keys revoke <key-id>
fal apps list                       # deployed serverless apps (we have none)
fal secrets set NAME value          # secrets for fal-hosted apps
```

For our use we are **clients of fal's hosted models**, not deploying serverless
apps — so only `keys` matters operationally.

## Runtime (inference) — for reference / smoke tests

Hosted models run via the queue or sync endpoints (auth identical):

```bash
# Synchronous (small/fast jobs):
curl -sS -X POST "https://fal.run/fal-ai/stable-audio-3/medium/text-to-audio" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"lofi rain loop","duration":8,"output_format":"mp3"}'
# → JSON with an `audio_url` (a fal CDN URL) to fetch the bytes. COSTS ~$0.0376.

# Queue (long jobs): POST https://queue.fal.run/<model-id> → request_id,
# poll GET https://queue.fal.run/<model-id>/requests/<id>/status, then /result.
```

`fal-ai/stable-audio-3/medium/text-to-audio` input params: `prompt` (req),
`duration` (default 30, up to ~380s), `num_inference_steps` (default 8),
`seed`, `negative_prompt` (default ""), `guidance_scale` (default 1),
`output_format` (default mp3; one of mp3/wav/flac/ogg/opus/m4a/aac). Output is a
URL, not inline bytes — fetch it.

## Credit / discount handling

Pay-as-you-go (card). No credit-pool/balance REST endpoint confirmed; dashboard
only. Finance reconciliation: treat like Replicate (Wise-cash vendor row +
Tinybird per-model attribution).

## Gotchas

- **Auth prefix is `Key `, not `Bearer `.** `Authorization: Key <id:secret>`.
- **Key format is `id:secret`.** Both halves required; the id alone is not a key.
- **CLI not installed by default** — `pip install fal`. REST works without it.
- **Model output is a URL**, not raw bytes — the handler must fetch the
  `audio_url`/`audio.url` from the response and stream it back.
- **API price ≠ web-page price** for SA3 Medium ($0.0376 vs $0.0417). Use the
  estimate API.
- **No confirmed historical-usage REST endpoint** — spend-over-time is
  dashboard/Tinybird only (this is the main open unknown).
- **ADMIN vs API scope:** never ship an ADMIN key as a runtime secret; mint an
  API-scoped key for the worker.

## Question → query cheat sheet

| Question | Endpoint / Source |
|---|---|
| Is the key valid? | `POST /v1/models/pricing/estimate` (200 = valid) |
| What does model X cost per call? | `POST /v1/models/pricing/estimate` (`unit_price`) |
| Projected cost of N calls? | `POST /v1/models/pricing/estimate` (`historical_api_price`) |
| How much have we spent MTD? | Dashboard (https://fal.ai/dashboard/billing) or Tinybird |
| What inputs does model X take? | Model page `…/<model-id>/api` (no public schema API confirmed) |
| Mint a runtime key | `fal keys create --scope API` (CLI) |
| Is model X healthy? | `POST https://fal.run/<model-id>` tiny job; check for `audio_url` |

## Known unknowns

- Historical usage / line-item spend REST endpoint (only `pricing/estimate`
  validated; dashboard mentions usage/analytics APIs but shape unconfirmed).
- Whether key CRUD is exposed over REST or CLI-only (`fal keys …` is CLI).
- Credit-pool / balance endpoint (dashboard-only so far).
