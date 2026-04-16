# Token Rotation Reference

## Token inventory

| Token | Trust boundary | SOPS files | Fan-out targets |
|-------|---------------|------------|-----------------|
| `PLN_ENTER_TOKEN` | CF Worker (enter) → EC2 (image/text) | enter `{dev,staging,prod}.vars.json`, image `env.json`, text `env.json` | GitHub secrets (`PLN_ENTER_TOKEN`, `ENTER_TOKEN`), Wrangler (production, staging) |
| `PLN_GPU_TOKEN` | EC2 image + enter (ACE-Step) → GPU workers | image `env.json`, enter `{dev,staging,prod}.vars.json` | Wrangler (production, staging), RunPod pods (Flux+Z-Image, Klein), Lambda Labs GH200 (LTX-2, ACE-Step, Sana) |
| `CLOUDFLARE_OBSERVABILITY_TOKEN` | enter.pollinations.ai observability pipeline | enter `env.json` | none |
| `TINYBIRD_INGEST_TOKEN` | enter runtime → Tinybird current workspace append | enter `{dev,staging,prod}.vars.json` | Wrangler (production, staging) |
| `TINYBIRD_READ_TOKEN` | enter/KPI/economics/app metrics → Tinybird current workspace read | enter `{dev,staging,prod}.vars.json`, kpi `env.json`, economics `secrets.vars.json` | GitHub secret `TINYBIRD_READ_TOKEN` |
| `TINYBIRD_SYNC_TOKEN` | GitHub Actions + enter admin route → Tinybird sync writes | enter `{dev,staging,prod}.vars.json` | GitHub secret `TINYBIRD_SYNC_TOKEN`, Wrangler (production, staging) |
| `TINYBIRD_LEGACY_READ_TOKEN` | economics → Tinybird legacy workspace read | economics `secrets.vars.json` | none |

## Scripts

### Infra tokens (internal)

| Script | Token | What it does |
|--------|-------|-------------|
| `rotate-infra-enter-token.sh` | `PLN_ENTER_TOKEN` | Updates SOPS → GitHub secrets → Wrangler secrets |
| `rotate-infra-gpu-token.sh` | `PLN_GPU_TOKEN` | Updates SOPS → Wrangler → SSH to each GPU worker, updates `.env`, restarts services |

### GenAI provider keys (external)

| Script | Provider | Mechanism |
|--------|----------|-----------|
| `rotate-genai-aws.sh` | AWS | IAM `create-access-key` → verify → delete old |
| `rotate-genai-azure.sh` | Azure | `az cognitiveservices account keys regenerate` (East US, Sweden, Content Safety) |
| `rotate-genai-gcp.sh` | GCP | `gcloud iam service-accounts keys create` → delete old |
| `rotate-genai-perplexity.sh` | Perplexity | API `generate_auth_token` → `revoke_auth_token` |
| `rotate-genai-fireworks.sh` | Fireworks | REST API create/delete |
| `rotate-genai-xai.sh` | xAI | Management API `/rotate` endpoint |
| `rotate-genai-elevenlabs.sh` | ElevenLabs | Service account API (multi-seat plans only) |

### Ops platform tokens

| Script | Platform | Mechanism |
|--------|----------|-----------|
| `rotate-ops-tinybird.sh` | Tinybird | Refresh tokens via API, update SOPS + GitHub + Wrangler |
| `rotate-ops-cloudflare.sh` | Cloudflare | Roll `CLOUDFLARE_OBSERVABILITY_TOKEN` via `PUT /tokens/{id}/value` |

All scripts default to **dry-run**: they always run a read-only connectivity check first, then print what would change. Pass `--execute` to actually rotate.

## Rotation admin credentials

Four scripts need extra admin credentials beyond the keys they rotate:

| Script | Admin credentials |
|--------|-------------------|
| `rotate-ops-tinybird.sh` | `TINYBIRD_ADMIN_TOKEN` |
| `rotate-genai-fireworks.sh` | `FIREWORKS_ACCOUNT_ID`, `FIREWORKS_USER_ID` |
| `rotate-genai-xai.sh` | `XAI_MANAGEMENT_KEY`, `XAI_TEAM_ID` |
| `rotate-genai-elevenlabs.sh` | `ELEVENLABS_SERVICE_ACCOUNT_ID`, `ELEVENLABS_ADMIN_API_KEY` |

The ElevenLabs script uses two distinct keys: `ELEVENLABS_ADMIN_API_KEY` (static, held here, authenticates admin API calls) and `ELEVENLABS_API_KEY` (runtime generative key, lives in enter SOPS, is what the script rotates).

These live in a SOPS-encrypted file next to the scripts:

```
tools/scripts/rotation/secrets.vars.json
```

Each of those four scripts sources `_load-admin-secrets.sh`, which exports any key from this SOPS file that isn't already set in the environment. Env vars always take precedence, so CI (which passes admin creds via GitHub secrets) is unaffected.

To add or update a credential locally:

```bash
sops tools/scripts/rotation/secrets.vars.json
```

The `TINYBIRD_ADMIN_TOKEN` can be copied from the Tinybird CLI (to the macOS clipboard):

```bash
tb --cloud token copy "admin token"
```

## Running

```bash
# Dry run (default) — verifies connectivity + prints planned changes
./rotate-infra-enter-token.sh
./rotate-genai-aws.sh
./rotate-ops-cloudflare.sh

# Real rotation — pre-flight still runs; aborts if it fails
./rotate-infra-enter-token.sh --execute
./rotate-genai-aws.sh --execute
./rotate-ops-cloudflare.sh --execute
TINYBIRD_ADMIN_TOKEN=xxx ./rotate-ops-tinybird.sh --execute --all
```

## CI workflows

Three `workflow_dispatch` workflows mirror the script categories. All require `main` branch, actor allowlist (voodoohop + ElliotEtag), and `production` environment.

| Workflow | Covers |
|----------|--------|
| `.github/workflows/rotate-infra-tokens.yml` | `enter`, `gpu`, `both` |
| `.github/workflows/rotate-genai-providers.yml` | aws, azure, gcp, perplexity, fireworks, xai, elevenlabs |
| `.github/workflows/rotate-ops-platforms.yml` | tinybird, cloudflare |

All default to dry-run. After rotation, the workflow SCPs decrypted `.env` files to EC2, restarts systemd services, and runs health checks before committing SOPS changes to main.

After running, commit the SOPS file changes and merge to trigger EC2 deploy.
`MUSIC_SERVICE_URL` is still required by ACE-Step and must remain configured in enter.

Tinybird notes:
- `tinybird_ingest` and `tinybird_read` are expected to be current-workspace consolidated tokens.
- `tinybird_sync` is shared by the D1 sync and APPS.md sync GitHub workflows.
- Public embedded Tinybird tokens are not rotated by this script.

## What breaks what

| If this token is wrong... | ...these break |
|--------------------------|----------------|
| `PLN_ENTER_TOKEN` in Wrangler but not SOPS | Enter worker sends old token → EC2 rejects with 403 |
| `PLN_ENTER_TOKEN` in SOPS but not Wrangler | EC2 expects new token → enter worker sends old → 403 |
| `PLN_GPU_TOKEN` in Wrangler but not GPU workers | enter sends new token to ACE-Step → GPU worker rejects → music generation fails |
| `PLN_GPU_TOKEN` on GPU workers but not Wrangler | ACE-Step GPU worker expects new token → enter sends old → music generation fails |
| `PLN_GPU_TOKEN` in SOPS/EC2 deploy but not GPU workers | image service sends new token → GPU workers reject → image generation fails |
| `PLN_GPU_TOKEN` on GPU workers but EC2 not redeployed yet | GPU workers expect new token → image service still sends old → image generation fails |

**Key insight:** both sides of each trust boundary must be updated together. For `PLN_GPU_TOKEN`, that means Wrangler, GPU workers, and an EC2 image deploy in the same rollout window.

## Rollback

If rotation breaks production, revert to the previous token value:

```bash
# 1. Get the old token from git history
git log -p -- image.pollinations.ai/secrets/env.json | head -50

# 2. Re-run the script with the old token
./rotate-infra-enter-token.sh OLD_TOKEN_VALUE
./rotate-infra-gpu-token.sh OLD_TOKEN_VALUE
```

Or revert the SOPS commit and redeploy.

## Secrets NOT rotated by these scripts

These require code changes or external coordination before automated rotation is safe:

| Secret | Why deferred |
|--------|-------------|
| `BETTER_AUTH_SECRET` | Needs `secrets: []` multi-secret array in Better Auth config — rotating now would invalidate all user sessions |
| `STRIPE_WEBHOOK_SECRET` | Needs dual-secret verifier in `stripe-webhooks.ts` |
| Provider API keys (Azure, AWS, etc.) | Issued by external providers, different rotation mechanisms |

**Out of scope:** Polar keys (`POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`) — Polar is a third-party payment platform; key rotation is managed through their dashboard and not automated here.

`MUSIC_SERVICE_URL` is intentionally not rotated here. It is configuration, not an auth token, and enter still needs it for ACE-Step routing.

## SSH keys

SSH keys for GPU workers are stored in SOPS (`enter.pollinations.ai/secrets/{dev,staging,prod}.vars.json`):

| SOPS key | Provider | Models | SSH target |
|----------|----------|--------|------------|
| `SSH_RUNPOD_FLUX_ZIMAGE` | RunPod | Flux + Z-Image | `root@38.65.239.17 -p 19489` |
| `SSH_RUNPOD_KLEIN` | RunPod | Klein 4B | `root@213.144.200.243 -p 10207` |
| `SSH_LAMBDA_SANA_LTX2_ACESTEP` | Lambda Labs | Sana + LTX-2 + ACE-Step | `ubuntu@192.222.51.105` |

To extract a key for SSH use:
```bash
sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.SSH_RUNPOD_KLEIN' > /tmp/key && chmod 600 /tmp/key
ssh -i /tmp/key root@213.144.200.243 -p 10207
```

## GPU worker details

| Worker | Pod/Host | SSH key (SOPS) | Token location | Restart method |
|--------|----------|---------------|---------------|----------------|
| Flux + Z-Image | RunPod `hsl3ksl31lvrcc` | `SSH_RUNPOD_FLUX_ZIMAGE` | `$HOME/.env` | Restart screen sessions |
| Klein 4B | RunPod `pi90tfk3sa9t12` | `SSH_RUNPOD_KLEIN` | `/workspace/.env` | `/workspace/restart.sh` |
| LTX-2 + ACE-Step + Sana | Lambda Labs GH200 | `SSH_LAMBDA_SANA_LTX2_ACESTEP` | `$HOME/.env` | `systemctl restart ltx2 acestep sana` |
