# Rotation Scripts — What's Left

Forward-looking status: what still needs to happen before these scripts can be trusted in production. Implementation details live in each script's header.

## Open work, in priority order

### 1. First real `--execute` run (highest priority)

Nothing has actually mutated production yet. Until one full cycle runs end-to-end, the PR→merge→production→deploy→health-check plumbing is unproven. Pick the lowest-risk script:

**`rotate-genai-perplexity.sh`** — small blast radius (text only), rolling-safe (old key valid until step 9), isolated provider, fastest revert path.

After it succeeds, what we'll know:
- `gh pr merge --auto --squash` actually waits for the right checks
- `git push origin main:production` is permitted (admin push under branch-protection)
- `gh run watch` correctly identifies the deploy run we just triggered
- Deploy workflow propagates new SOPS values to EC2 (SCP + systemd restart)
- The new provider-specific health check actually trips on a broken key (today the snippet works against the *current* key — failure mode is unverified)

If anything breaks mid-cycle, perplexity revert is one curl call.

### 1b. SOPS CI key rotation — script exists, `--execute` unproven

`rotate-infra-sops-ci.sh` codifies the manual CI-key split we did on 2026-04-19
(PR #10337 + GH Actions secret swap). Dry-run passes. The `--execute` path has
not been run end-to-end yet:

- Phase 1 PR (add new recipient) + auto-merge — reuses the same mechanics as
  the provider scripts, should work
- `gh secret set SOPS_AGE_KEY` — proven manually already
- `gh workflow run deploy-gen-cloudflare.yml -f environment=staging` + `gh run
  watch` — the decrypt-step-green gate is new; behaviour on failure is unverified
- Phase 3 PR (remove old recipient) — same mechanics as Phase 1

Before running `--execute`, confirm the new CI key actually decrypts on main —
#10255 regression proved the recipient set can drift unnoticed.

### 1c. SOPS personal key rotation — script exists, no valid operator today

`rotate-infra-sops-personal.sh` works for any single-holder age recipient.
Refuses to run against `core` (shared) or `ci` (wrong script). Usable today
only by Itachi. Elliot/Thomas can't use it until the `core` identity is split
per-person (deferred).

Dry-run on an operator with a non-`core` local key would print the plan; we
have not exercised that path from any developer machine.

### 2. Then validate the harder cycles

Each of these has a structural unknown the perplexity run can't answer:

- **`rotate-genai-aws.sh`** — IAM key propagation delay. Sleep 10s may not be enough for sts to recognize the new key under load.
- **`rotate-genai-xai.sh`** — new `POST /auth/api-keys` path with cloned ACLs. Has the response shape we expect? Does the new key actually inherit the ACLs?
- **`rotate-genai-elevenlabs.sh`** — first run will leave the personal `ELEVENLABS_API_KEY` orphaned (admin SA can't delete a key it doesn't own). Operator must revoke it manually in the UI. Confirm the warning fires.
- **`rotate-infra-enter-token.sh`** — EC2→worker rejection window. Between `deploy-gen-cloudflare.yml` finishing and `wrangler secret put`, any in-flight backend request from the old EC2 build will be rejected by the worker. Window should be seconds; needs measurement.
- **`rotate-infra-gpu-token.sh`** — SSH fan-out across 3 GPU hosts during a live rotation. Worker restart sequencing is documented but never exercised. Highest blast radius — image generation breaks if any host misses the new token.
- **`rotate-genai-azure.sh`** — key1/key2 alternation depends on Azure correctly accepting both slots during the deploy window. Documented as zero-downtime by design; not verified.
- **`rotate-ops-tinybird.sh`** — `wrangler secret put` happens before the PR merges. If the PR is rejected, SOPS and Wrangler diverge. Recovery path needs documenting.

### 3. Environmental blockers (operator-side, not script bugs)

These prevent specific scripts from running on the current machine:

- **azure (safety only)** — `gptimagemain1-resource` lives in a subscription not visible to the default `az` context. `--resource east` and `--resource sweden` work standalone; `--resource safety` and `--resource all` need `az account set --subscription <other>` first. Same decision: document or fix.
- **`TINYBIRD_LEGACY_READ_TOKEN`** — lives in the retired `pollinations_ai` workspace. Consumed by `apps/operation/economics`. Current admin token can't rotate it. Either rotate manually periodically, or migrate economics off the legacy workspace and delete the token.

### 4. Modularization (lowest priority — only after #1-#3 prove the design)

Each script duplicates the PR → merge → push-to-production → watch-deploy tail (~80 lines × 9 scripts ≈ 700 LOC of duplicated bash). Decision was deliberate ("100% self-contained per script"), but once the pattern is proven across multiple successful `--execute` runs, extracting `_pr-and-deploy.sh` becomes safe.

## Providers without automated rotation (manual only)

Out of scope for this branch — listed here so they don't get forgotten during periodic rotation cycles.

| Provider | Env var(s) | Used by | SOPS file(s) | Dashboard |
|---|---|---|---|---|
| **Alibaba (DashScope)** | `DASHSCOPE_API_KEY` | image + text (Wan image, Qwen text) | `image.pollinations.ai/secrets/env.json`, `gen.pollinations.ai/secrets/env.json` | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com) |
| **ByteDance** | `BYTEDANCE_API_KEY` | image (SeedEdit, Seedream) | `image.pollinations.ai/secrets/env.json` | [volcengine.com](https://www.volcengine.com) |
| **Pruna** | `PRUNA_API_KEY` | image (Pruna-optimised models) | `image.pollinations.ai/secrets/env.json` | [pruna.ai dashboard](https://pruna.ai) |
| **OVHCloud** | `OVHCLOUD_API_KEY` | text (OVH AI) + enter worker (audio fallback) | `gen.pollinations.ai/secrets/env.json`, `enter.pollinations.ai/secrets/{dev,staging,prod}.vars.json` | [ovh.com manager](https://www.ovh.com/manager/) |

Manual recipe: dashboard → new key → SOPS edit → (worker keys also need `wrangler secret put`) → PR → merge → push to production → wait for deploy + health check → revoke old key in dashboard.

Community-tier models in `text.ts` (provider `community`) have no key to rotate — they run on free public endpoints.

## Readiness snapshot

| Script | Can run `--execute` today? | If not, why |
|---|---|---|
| `rotate-genai-perplexity.sh` | yes | — |
| `rotate-genai-fireworks.sh` | yes | — |
| `rotate-genai-deepinfra.sh` | yes (pending first end-to-end run) | — |
| `rotate-genai-aws.sh` | yes | — |
| `rotate-genai-xai.sh` | yes | — |
| `rotate-genai-elevenlabs.sh` | yes (first-run leaves personal key) | — |
| `rotate-ops-tinybird.sh` | yes | — |
| `rotate-infra-enter-token.sh` | yes | — |
| `rotate-infra-gpu-token.sh` | yes | — |
| `rotate-genai-azure.sh` | east + sweden yes; safety + all no | safety needs `az account set --subscription <other>` |
| `rotate-genai-gcp.sh` | yes | authenticates from SOPS via dedicated `key-rotator` SA — no interactive `gcloud auth login` needed |
| `rotate-infra-sops-ci.sh` | yes (pending first end-to-end run) | — |
| `rotate-infra-sops-personal.sh` | only for operators whose local key is a personal recipient | today: Itachi only; Elliot/Thomas need `core` identity split first |
