# Token Rotation Reference

Local-only rotation scripts. Each script is self-contained and runs the full cycle end-to-end: create new secret on the provider, update SOPS + Wrangler + GitHub secrets, open a PR to `main`, auto-merge, promote `main` → `production`, wait for deploy, health-check, delete the old secret.

No CI workflows — operators run scripts from their own machine with admin credentials.

## Token inventory

| Token | Trust boundary | SOPS files | Fan-out targets |
|-------|---------------|------------|-----------------|
| `PLN_ENTER_TOKEN` | CF Worker (enter) → EC2 (image/text) | enter `{dev,staging,prod}.vars.json`, image `env.json`, text `env.json` | GitHub secrets (`PLN_ENTER_TOKEN`, `ENTER_TOKEN`), Wrangler (production, staging) |
| `PLN_GPU_TOKEN` | EC2 image + enter (ACE-Step) → GPU workers | image `env.json`, enter `{dev,staging,prod}.vars.json` | Wrangler (production, staging), RunPod pods (Flux+Z-Image, Klein), Lambda Labs GH200 (LTX-2, ACE-Step, Sana) |
| `CLOUDFLARE_OBSERVABILITY_TOKEN` | enter.pollinations.ai observability pipeline | enter `env.json` | none |
| `TINYBIRD_INGEST_TOKEN` | enter runtime → Tinybird current workspace append | enter `{dev,staging,prod}.vars.json` | Wrangler (production, staging) |
| `TINYBIRD_READ_TOKEN` | enter/KPI/economics/app metrics → Tinybird current workspace read | enter `{dev,staging,prod}.vars.json`, kpi `env.json`, economics `secrets.vars.json` | GitHub secret `TINYBIRD_READ_TOKEN` |
| `TINYBIRD_SYNC_TOKEN` | GitHub Actions + enter admin route → Tinybird sync writes | enter `{dev,staging,prod}.vars.json` | GitHub secret `TINYBIRD_SYNC_TOKEN`, Wrangler (production, staging) |

`TINYBIRD_LEGACY_READ_TOKEN` (consumed by `apps/operation/economics`) lives in the retired `pollinations_ai` workspace and is not rotated by any script — rotate manually or migrate economics off the legacy workspace.

## Scripts

### Infra tokens (internal)

| Script | Token | What it does |
|--------|-------|-------------|
| `rotate-infra-enter-token.sh` | `PLN_ENTER_TOKEN` | Generates new token → SOPS → GitHub secrets → Wrangler → PR → prod → deploy → health check |
| `rotate-infra-gpu-token.sh` | `PLN_GPU_TOKEN` | Generates new token → SSH to each GPU worker → SOPS → Wrangler → PR → prod → deploy → health check |

### GenAI provider keys (external)

| Script | Provider | Rotation strategy | Downtime |
|--------|----------|-------------------|----------|
| `rotate-genai-aws.sh` | AWS | IAM create new → deploy → delete old | 0 (rolling) |
| `rotate-genai-azure.sh` | Azure | alternate key1/key2 (use unused slot, deploy, leave previous slot valid) | 0 (dual-key) |
| `rotate-genai-gcp.sh` | GCP | `gcloud iam service-accounts keys create` → deploy → delete old | 0 (rolling) |
| `rotate-genai-perplexity.sh` | Perplexity | `generate_auth_token` → deploy → `revoke_auth_token` | 0 (rolling) |
| `rotate-genai-fireworks.sh` | Fireworks | REST create → deploy → delete old | 0 (rolling) |
| `rotate-genai-xai.sh` | xAI | `POST /auth/api-keys` create → deploy → `DELETE /auth/api-keys/{id}` | 0 (rolling) |
| `rotate-genai-elevenlabs.sh` | ElevenLabs | SA create → deploy → delete old | 0 (rolling) |

### Ops platform tokens

| Script | Platform | Rotation strategy | Downtime |
|--------|----------|-------------------|----------|
| `rotate-ops-tinybird.sh` | Tinybird | `POST /tokens/{name}/refresh` (in-place) + live Wrangler put | ~5s wrangler propagation |
| `rotate-ops-cloudflare.sh` | Cloudflare | `PUT /tokens/{id}/value` (in-place) + live Wrangler put | ~5s wrangler propagation |

All scripts default to **dry-run**. Pass `--execute` to actually rotate.

## End-to-end flow (every `--execute` run)

```
1. Pre-flight: verify all accesses (SOPS, provider API, wrangler, gh, etc.)
2. Create new secret on provider (old stays valid)
3. Update SOPS files
4. Update Wrangler + GitHub secrets (live — bridges the deploy gap for worker consumers)
5. git checkout -b rotate/<name>-<date>
6. git add <sops files>, commit, push
7. gh pr create --base main, gh pr merge --auto --squash
8. Poll until PR is MERGED
9. git fetch && git push origin main:production  (admin push, no PR)
10. gh run watch <deploy workflow>
11. Health check against production endpoint
12. Delete old secret on provider (only if health check passes)
13. Exit 0
```

Step 9 requires admin permission on the repo (direct push to `production`). Step 7 uses repo's auto-merge feature.

## Admin credentials

Four scripts need extra admin credentials beyond the keys they rotate:

| Script | Admin credentials |
|--------|-------------------|
| `rotate-ops-tinybird.sh` | `TINYBIRD_ADMIN_TOKEN` |
| `rotate-genai-fireworks.sh` | `FIREWORKS_ACCOUNT_ID`, `FIREWORKS_USER_ID` |
| `rotate-genai-xai.sh` | `XAI_MANAGEMENT_KEY`, `XAI_TEAM_ID` |
| `rotate-genai-elevenlabs.sh` | `ELEVENLABS_SERVICE_ACCOUNT_ID`, `ELEVENLABS_ADMIN_API_KEY` |

The ElevenLabs script uses two distinct keys: `ELEVENLABS_ADMIN_API_KEY` (static, authenticates admin API calls) and `ELEVENLABS_API_KEY` (runtime generative key, lives in enter SOPS, is what the script rotates).

These admin credentials live in a SOPS-encrypted file alongside the scripts:

```
tools/scripts/rotation/secrets.vars.json
```

Each script sources `_load-admin-secrets.sh`, which decrypts this file and exports any keys not already set in the environment. Env vars take precedence, so you can override locally without touching SOPS.

To edit a credential:
```bash
sops tools/scripts/rotation/secrets.vars.json
```

Quick ways to obtain the admin credentials:
- `TINYBIRD_ADMIN_TOKEN` — `tb --cloud token copy "admin token"` (puts it in the macOS clipboard, then `pbpaste`).
- `XAI_MANAGEMENT_KEY`, `XAI_TEAM_ID` — console.x.ai → Team settings.
- `ELEVENLABS_ADMIN_API_KEY`, `ELEVENLABS_SERVICE_ACCOUNT_ID` — ElevenLabs → Developers → Service Accounts (key needs `workspace_read` + `workspace_write`).
- `FIREWORKS_ACCOUNT_ID`, `FIREWORKS_USER_ID` — Fireworks dashboard or `~/.fireworks/auth.ini`.

## Running

```bash
# Dry run (default) — verifies connectivity + prints planned changes, no mutation
./rotate-infra-enter-token.sh
./rotate-genai-aws.sh

# Real rotation — runs the full cycle end-to-end, including PR + deploy + health check
./rotate-infra-enter-token.sh --execute
./rotate-genai-aws.sh --execute
./rotate-ops-cloudflare.sh --execute
./rotate-ops-tinybird.sh --execute --all
```

## What breaks what

| If this token is wrong... | ...these break |
|--------------------------|----------------|
| `PLN_ENTER_TOKEN` in Wrangler but not SOPS | Enter worker sends old token → EC2 rejects with 403 |
| `PLN_ENTER_TOKEN` in SOPS but not Wrangler | EC2 expects new token → enter worker sends old → 403 |
| `PLN_GPU_TOKEN` in Wrangler but not GPU workers | enter sends new token to ACE-Step → GPU worker rejects → music generation fails |
| `PLN_GPU_TOKEN` on GPU workers but not Wrangler | ACE-Step GPU worker expects new token → enter sends old → music generation fails |
| `PLN_GPU_TOKEN` in SOPS/EC2 deploy but not GPU workers | image service sends new token → GPU workers reject → image generation fails |
| `PLN_GPU_TOKEN` on GPU workers but EC2 not redeployed yet | GPU workers expect new token → image service still sends old → image generation fails |

**Key insight:** both sides of each trust boundary must be updated together. The end-to-end flow handles this atomically; individual `wrangler secret put` or SOPS edits do not.

## Rollback

If rotation breaks production, revert to the previous token value:

```bash
# 1. Get the old token from git history
git log -p -- image.pollinations.ai/secrets/env.json | head -50

# 2. Re-run the script with the old token
./rotate-infra-enter-token.sh OLD_TOKEN_VALUE --execute
./rotate-infra-gpu-token.sh OLD_TOKEN_VALUE --execute
```

Or revert the SOPS commit on `main`, push `main` to `production`, and redeploy.

## Secrets NOT rotated by these scripts

| Secret | Why deferred |
|--------|-------------|
| `BETTER_AUTH_SECRET` | Needs `secrets: []` multi-secret array in Better Auth config — rotating now would invalidate all user sessions |
| `STRIPE_WEBHOOK_SECRET` | Needs dual-secret verifier in `stripe-webhooks.ts` |
| Polar (`POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`) | Third-party payment platform; rotation managed through Polar dashboard |

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
