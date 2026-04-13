# Token Rotation Reference

## Token inventory

| Token | Trust boundary | SOPS files | Fan-out targets |
|-------|---------------|------------|-----------------|
| `PLN_ENTER_TOKEN` | CF Worker (enter) → EC2 (image/text) | enter `{dev,staging,prod}.vars.json`, image `env.json`, text `env.json` | GitHub secrets (`PLN_ENTER_TOKEN`, `ENTER_TOKEN`), Wrangler (production, staging) |
| `PLN_GPU_TOKEN` | EC2 image + enter (ACE-Step) → GPU workers | image `env.json`, enter `{dev,staging,prod}.vars.json` | Wrangler (production, staging), RunPod pods (Flux+Z-Image, Klein), Lambda Labs GH200 (LTX-2, ACE-Step, Sana) |

## Scripts

| Script | Token | What it does |
|--------|-------|-------------|
| `rotate-pln-enter-token.sh` | `PLN_ENTER_TOKEN` | Updates SOPS → GitHub secrets → Wrangler secrets |
| `rotate-pln-gpu-token.sh` | `PLN_GPU_TOKEN` | Updates SOPS → Wrangler → SSH to each GPU worker, updates `.env`, restarts services |

Both scripts accept `--dry-run` to preview without making changes, and an optional `NEW_TOKEN` argument (otherwise generates one via `openssl rand -hex 32`).

## Running

```bash
# Dry run first
./rotate-pln-enter-token.sh --dry-run
./rotate-pln-gpu-token.sh --dry-run

# Real run (generates new token automatically)
./rotate-pln-enter-token.sh
./rotate-pln-gpu-token.sh

# With a specific token
./rotate-pln-enter-token.sh TOKEN_VALUE
```

After running, commit the SOPS file changes and merge to trigger EC2 deploy.
`MUSIC_SERVICE_URL` is still required by ACE-Step and must remain configured in enter.

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
./rotate-pln-enter-token.sh OLD_TOKEN_VALUE
./rotate-pln-gpu-token.sh OLD_TOKEN_VALUE
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
