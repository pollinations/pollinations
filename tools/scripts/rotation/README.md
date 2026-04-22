# Token Rotation Reference

Local-only rotation scripts. Each script is self-contained and runs the full cycle end-to-end: create new secret on the provider, update SOPS + Wrangler + GitHub secrets, open a PR to `main`, auto-merge, promote `main` → `production`, wait for deploy, health-check, delete the old secret.

No CI workflows — operators run scripts from their own machine with admin credentials.

## Token inventory

| Token | Trust boundary | SOPS files | Fan-out targets |
|-------|---------------|------------|-----------------|
| `PLN_ENTER_TOKEN` | CF Worker (enter) → EC2 (image/text) | enter `{dev,staging,prod}.vars.json`, image `env.json`, text `env.json` | GitHub secrets (`PLN_ENTER_TOKEN`, `ENTER_TOKEN`), Wrangler (production, staging) |
| `PLN_GPU_TOKEN` | EC2 image + enter (ACE-Step) → GPU workers | image `env.json`, enter `{dev,staging,prod}.vars.json` | Wrangler (production, staging), RunPod pods (Flux+Z-Image, Klein), Lambda Labs GH200 (LTX-2, ACE-Step, Sana) |
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

### SOPS encryption keys (operator identities)

| Script | Key | What it does |
|--------|-----|-------------|
| `rotate-infra-sops-ci.sh` | `ci` recipient + GH Actions `SOPS_AGE_KEY` | Two-phase: add new age recipient → PR → merge → swap GH secret → trigger staging deploy → verify decrypt step → remove old recipient → PR → merge |
| `rotate-infra-sops-personal.sh` | Whichever personal recipient matches the operator's local key | Two-phase: add new age recipient → PR → merge → install new private key locally → verify decrypt → remove old recipient → PR → merge. Refuses to run against `core` (shared) or `ci` recipients |

Recipient roles are labelled in `sops-recipients.yaml` (`core`, `itachi`, `ci`) so the rotation scripts know which pubkey corresponds to which identity.

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

## Per-script behaviour

Each script follows the same 13-step flow; the table describes what is verified, what mechanism is used, and where deploy/health converge for that specific secret.

### `rotate-infra-enter-token.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations |
| Pre-flight | git clean, gh authed, wrangler authed, SOPS decryptable, `PLN_ENTER_TOKEN` present in all 5 SOPS files |
| Rotation mechanism | `openssl rand -hex 32` (self-generated; we own both sides of the trust boundary) |
| Create-before-delete | n/a (no external secret to delete; old token simply stops being used) |
| Branch naming | `rotate/enter-token-<timestamp>` |
| PR body | Mentions automation, new token prefix, fan-out targets |
| Auto-merge | `gh pr merge --auto --squash` |
| Merge wait | Poll PR state, 15min timeout |
| main→production | `git push origin main:production` (admin push) |
| Deploy wait | `deploy-enter-cloudflare.yml` AND `deploy-enter-services.yml` |
| Health check | `GET gen.pollinations.ai/v1/models` → 200 (verifies enter gateway + EC2) |
| Failure handling | If any step after SOPS update fails, new token is still half-live; operator must reconcile |
| Cleanup | Restore original branch at end |

### `rotate-infra-gpu-token.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations |
| Pre-flight | git clean, gh, wrangler, SOPS with 3 SSH keys, SSH reachable to all 3 GPU hosts |
| Rotation mechanism | `openssl rand -hex 32` + SSH fan-out to RunPod (Flux+Z-Image, Klein) + Lambda Labs (LTX-2+ACE-Step+Sana) |
| Create-before-delete | n/a |
| Branch naming | `rotate/gpu-token-<timestamp>` |
| PR body | Mentions automation, new token prefix, 3 GPU hosts updated |
| Auto-merge | `gh pr merge --auto --squash` |
| Merge wait | Poll PR state, 15min timeout |
| main→production | `git push origin main:production` (admin push) |
| Deploy wait | `deploy-enter-cloudflare.yml` + `deploy-enter-services.yml` |
| Health check | `GET gen.pollinations.ai/image/...` (image path exercises GPU backend) |
| Failure handling | Step ordering places SSH fan-out BEFORE wrangler put so GPUs accept new token before enter starts sending it |
| Cleanup | Restore original branch at end |

### `rotate-genai-aws.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations |
| Pre-flight | git clean, gh authed, SOPS decryptable, AWS sts works with current key |
| Rotation mechanism | IAM `create-access-key` → wait for propagation → verify → (later) `delete-access-key` |
| Create-before-delete | ✅ (AWS allows 2 active keys per user) |
| Branch naming | `rotate/aws-<timestamp>` |
| PR body | Mentions automation, old key ID, IAM user |
| Auto-merge | `gh pr merge --auto --squash` |
| Merge wait | Poll PR state, 15min timeout |
| main→production | `git push origin main:production` (admin push) |
| Deploy wait | `deploy-enter-services.yml` |
| Health check | `GET gen.pollinations.ai/v1/models` → 200 |
| Failure handling | Any failure after key creation = abort without deleting old key; old still valid |
| Cleanup | Restore original branch at end |

### `rotate-genai-azure.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations (for each of 3 resources) |
| Pre-flight | git clean, gh, `az account show`, list cognitive services accounts, SOPS readable |
| Rotation mechanism | Alternate key1/key2 slot per resource: detect which slot matches SOPS → regenerate the UNUSED slot → update SOPS to it (previous slot stays valid in Azure) |
| Create-before-delete | ✅ via dual-key (Azure always exposes key1+key2; unused slot = the rolling backup) |
| Branch naming | `rotate/azure-<timestamp>` |
| PR body | Mentions automation, which of 3 resources rotated, slot switched |
| Auto-merge | `gh pr merge --auto --squash` |
| Merge wait | Poll PR state, 15min timeout |
| main→production | `git push origin main:production` (admin push) |
| Deploy wait | `deploy-enter-services.yml` |
| Health check | `POST gen.pollinations.ai/v1/chat/completions` with an Azure-backed model → 200 |
| Failure handling | If deploy fails, previous slot still valid in SOPS via git revert |
| Cleanup | Restore original branch at end |

### `rotate-genai-gcp.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations |
| Pre-flight | git clean, gh, `gcloud auth list`, can list SA keys, SOPS readable |
| Rotation mechanism | `gcloud iam service-accounts keys create` → verify → (later) `keys delete` |
| Create-before-delete | ✅ (GCP allows up to 10 keys per SA) |
| Branch naming | `rotate/gcp-<timestamp>` |
| PR body | Mentions automation, SA email, old key ID |
| Auto-merge | `gh pr merge --auto --squash` |
| Merge wait | Poll PR state, 15min timeout |
| main→production | `git push origin main:production` (admin push) |
| Deploy wait | `deploy-enter-services.yml` |
| Health check | `POST gen.pollinations.ai/v1/chat/completions` with a GCP/Vertex-backed model → 200 |
| Failure handling | Any failure after key creation = abort without deleting old key |
| Cleanup | Restore original branch at end |

### `rotate-genai-perplexity.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations |
| Pre-flight | git clean, gh, current key works via `/chat/completions`, SOPS readable |
| Rotation mechanism | `POST /generate_auth_token` → verify → (later) `POST /revoke_auth_token` (authed with new key) |
| Create-before-delete | ✅ |
| Branch naming | `rotate/perplexity-<timestamp>` |
| PR body | Mentions automation, new key prefix |
| Auto-merge | `gh pr merge --auto --squash` |
| Merge wait | Poll PR state, 15min timeout |
| main→production | `git push origin main:production` (admin push) |
| Deploy wait | `deploy-enter-services.yml` |
| Health check | `POST gen.pollinations.ai/v1/chat/completions` with `sonar` model → 200 |
| Failure handling | Any failure after new-key creation = abort without revoking old |
| Cleanup | Restore original branch at end |

### `rotate-genai-fireworks.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations |
| Pre-flight | git clean, gh, `FIREWORKS_ACCOUNT_ID` + `FIREWORKS_USER_ID` set, current key lists apiKeys |
| Rotation mechanism | `POST apiKeys` → verify → (later) `POST apiKeys:delete` |
| Create-before-delete | ✅ |
| Branch naming | `rotate/fireworks-<timestamp>` |
| PR body | Mentions automation, new key prefix, account/user IDs |
| Auto-merge | `gh pr merge --auto --squash` |
| Merge wait | Poll PR state, 15min timeout |
| main→production | `git push origin main:production` (admin push) |
| Deploy wait | `deploy-enter-services.yml` |
| Health check | `POST gen.pollinations.ai/v1/chat/completions` with a Fireworks-backed model → 200 |
| Failure handling | Any failure after new-key creation = abort without deleting old |
| Cleanup | Restore original branch at end |

### `rotate-genai-xai.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations |
| Pre-flight | git clean, gh, `XAI_MANAGEMENT_KEY` + `XAI_TEAM_ID` set, can list team api-keys |
| Rotation mechanism | `POST /auth/api-keys` with cloned ACLs from old key → verify → (later) `DELETE /auth/api-keys/{old-id}` |
| Create-before-delete | ✅ (replaces old `/rotate` in-place approach, which was immediate-invalidate) |
| Branch naming | `rotate/xai-<timestamp>` |
| PR body | Mentions automation, new key prefix, old apiKeyId |
| Auto-merge | `gh pr merge --auto --squash` |
| Merge wait | Poll PR state, 15min timeout |
| main→production | `git push origin main:production` (admin push) |
| Deploy wait | `deploy-enter-services.yml` (xAI is consumed by image EC2) |
| Health check | `POST gen.pollinations.ai/v1/chat/completions` with a grok model → 200 |
| Failure handling | Any failure after new-key creation = abort without deleting old |
| Cleanup | Restore original branch at end |

### `rotate-genai-elevenlabs.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations |
| Pre-flight | git clean, gh, wrangler, `ELEVENLABS_ADMIN_API_KEY` + `ELEVENLABS_SERVICE_ACCOUNT_ID` set, admin can list SA keys |
| Rotation mechanism | `POST /service-accounts/{id}/api-keys` (authed with admin key) → (later) `DELETE /service-accounts/{id}/api-keys/{old-id}` |
| Create-before-delete | ✅ (SA allows multiple keys coexisting) |
| Branch naming | `rotate/elevenlabs-<timestamp>` |
| PR body | Mentions automation, new key prefix, SA ID |
| Auto-merge | `gh pr merge --auto --squash` |
| Merge wait | Poll PR state, 15min timeout |
| main→production | `git push origin main:production` (admin push) |
| Deploy wait | `deploy-enter-cloudflare.yml` (ElevenLabs is called by enter worker) |
| Health check | `POST gen.pollinations.ai/v1/audio/speech` (worker calls ElevenLabs) → 200 |
| Failure handling | On first rotation, old runtime key may be Thomas's personal (not under SA) → skip delete, warn operator to revoke manually |
| Cleanup | Restore original branch at end |

### `rotate-infra-sops-ci.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations |
| Pre-flight | Tools present, gh authed, `.sops.yaml` + `sops-recipients.yaml` readable, labelled `ci` recipient exists in `.sops.yaml`, current `SOPS_AGE_KEY` decrypts, GH Actions secret `SOPS_AGE_KEY` exists on repo |
| Rotation mechanism | Two-phase with overlap window: Phase 1 adds new pubkey → `sops updatekeys` → PR; Phase 2 swaps GH secret + staging-deploy verify; Phase 3 removes old pubkey → PR |
| Create-before-delete | ✅ (old recipient stays in `.sops.yaml` until after new key proven in CI) |
| Branch naming | `rotate/sops-ci-add-new-<timestamp>`, `rotate/sops-ci-remove-old-<timestamp>` |
| PR body | Mentions automation, phase, and that old key stays valid until next phase |
| Auto-merge | `gh pr merge --auto --squash` (both PRs) |
| Merge wait | Poll PR state, 15min timeout per phase |
| main→production | n/a — this is a CI-identity rotation, not a deploy. Staging deploy is used only to verify the new key decrypts; production unaffected |
| Deploy wait | `deploy-enter-services.yml` triggered via `workflow_dispatch -f environment=staging` between Phase 1 and Phase 3 |
| Health check | "Decrypt .env files with SOPS" step green in staging run |
| Failure handling | Old recipient is still a valid decryptor until Phase 3 — revert GH secret with old key if staging fails, abort before Phase 3 |
| Cleanup | Shred temp new-key file via EXIT trap; print new private key one last time for the operator to back up |

### `rotate-infra-sops-personal.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations |
| Pre-flight | Tools present, gh authed, `.sops.yaml` + `sops-recipients.yaml` readable, exactly one local age private key matches a `.sops.yaml` recipient, matched role is not `core` (shared) and not `ci` (use other script), SOPS files decryptable |
| Rotation mechanism | Two-phase with overlap window: Phase 1 adds new pubkey → `sops updatekeys` → PR; Phase 2 installs new private key locally + verifies; Phase 3 removes old pubkey → PR |
| Create-before-delete | ✅ (old recipient stays until operator has confirmed new key works post-merge) |
| Branch naming | `rotate/sops-personal-<role>-add-<timestamp>`, `rotate/sops-personal-<role>-remove-<timestamp>` |
| PR body | Mentions automation, phase, new pubkey |
| Auto-merge | `gh pr merge --auto --squash` (both PRs) |
| Merge wait | Poll PR state, 15min timeout per phase |
| main→production | n/a |
| Deploy wait | n/a (personal identities are not consumed by CI) |
| Health check | Decrypt smoke test: `sops -d <file>` using only the new private key, between Phases 1 and 3 |
| Failure handling | Old key still a valid recipient until Phase 3 PR merges — if local key install breaks, roll back by deleting the new key block from `~/.config/sops/age/keys.txt` and keeping old |
| Cleanup | Append new key to `~/.config/sops/age/keys.txt`, prune old key from same file. If operator uses `SOPS_AGE_KEY` env var, prints manual instructions instead (shell config can't be edited programmatically) |
| Refuses against | `core` (would invalidate Thomas's access), `ci` (wrong script — use rotate-infra-sops-ci.sh) |

### `rotate-ops-tinybird.sh`

| Aspect | Choice |
|---|---|
| Dry-run | Shows plan, exits 0 with no mutations |
| Pre-flight | git clean, gh, wrangler, `TINYBIRD_ADMIN_TOKEN` set, can list workspace tokens |
| Rotation mechanism | `POST /tokens/{name}/refresh` for each of ingest/read/sync (in-place — immediate invalidation per token) |
| Create-before-delete | ❌ (in-place refresh). Wrangler `secret put` applied immediately per token to close the ~5s gap. |
| Branch naming | `rotate/tinybird-<timestamp>` |
| PR body | Mentions automation, which tokens rotated |
| Auto-merge | `gh pr merge --auto --squash` (for SOPS + GitHub secret audit sync) |
| Merge wait | Poll PR state, 15min timeout |
| main→production | `git push origin main:production` (admin push) |
| Deploy wait | n/a — worker-consumed; wrangler put already applied. GitHub secret update affects sync workflow on its next run. |
| Health check | Verify worker can write an event to Tinybird with the new `ingest` token |
| Failure handling | Per-token in-place rotate; partial failure (e.g. ingest OK, read fails) leaves mixed state — operator re-runs with `--token <name>` |
| Cleanup | Restore original branch at end |

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

## GPU workers

Hosts reached by SSH during `rotate-infra-gpu-token.sh`. SSH keys are stored in SOPS (`enter.pollinations.ai/secrets/{dev,staging,prod}.vars.json`) and extracted into a temp file at rotation time.

| Worker | Pod / Host | SSH key (SOPS) | SSH target | `.env` path | Restart |
|---|---|---|---|---|---|
| Flux + Z-Image | RunPod `hsl3ksl31lvrcc` | `SSH_RUNPOD_FLUX_ZIMAGE` | `root@38.65.239.17 -p 19489` | `$HOME/.env` | screen sessions |
| Klein 4B | RunPod `pi90tfk3sa9t12` | `SSH_RUNPOD_KLEIN` | `root@213.144.200.243 -p 10207` | `/workspace/.env` | `/workspace/restart.sh` |
| LTX-2 + ACE-Step + Sana | Lambda Labs GH200 | `SSH_LAMBDA_SANA_LTX2_ACESTEP` | `ubuntu@192.222.51.105` | `$HOME/.env` | `systemctl restart ltx2 acestep sana` |

`MUSIC_SERVICE_URL` in enter's SOPS points at the ACE-Step endpoint on the Lambda GH200 host. It is configuration (not an auth token) and is not rotated — but if the Lambda host changes, this URL has to move with it.

Ad-hoc SSH for debugging a GPU host:

```bash
sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.SSH_RUNPOD_KLEIN' > /tmp/key && chmod 600 /tmp/key
ssh -i /tmp/key root@213.144.200.243 -p 10207
```
