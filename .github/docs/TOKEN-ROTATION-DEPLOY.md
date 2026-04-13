# Token Rotation

Reference for secret rotation across the Pollinations infrastructure.

## Token architecture

| Token | Trust boundary | Where it lives | Fan-out targets |
|-------|---------------|----------------|-----------------|
| `PLN_ENTER_TOKEN` | CF Worker (enter) → EC2 | SOPS (5 files), Wrangler, GitHub secrets | GitHub (`PLN_ENTER_TOKEN`, `ENTER_TOKEN`), Wrangler (prod, staging) |
| `PLN_GPU_TOKEN` | EC2 image → GPU workers | SOPS (1 file), `$HOME/.env` on workers | RunPod pods (Flux+Z-Image, Klein), Lambda Labs GH200 |

## Rotation scripts

All scripts live in `tools/scripts/`. See `tools/scripts/ROTATION.md` for the full reference (token inventory, what-breaks-what matrix, rollback).

```bash
# Rotate PLN_ENTER_TOKEN (enter → EC2)
./tools/scripts/rotate-pln-enter-token.sh [--dry-run] [TOKEN]

# Rotate PLN_GPU_TOKEN (EC2 → GPU workers)
./tools/scripts/rotate-pln-gpu-token.sh [--dry-run] [TOKEN]
```

Both scripts:
- Generate a new token via `openssl rand -hex 32` (or accept one as argument)
- Write to SOPS before fanning out
- Support `--dry-run` to preview without changes

## What breaks what

| Scenario | Impact |
|----------|--------|
| `PLN_ENTER_TOKEN` updated in Wrangler but not SOPS/EC2 | Enter sends new token → EC2 rejects → all API requests fail |
| `PLN_ENTER_TOKEN` updated in SOPS/EC2 but not Wrangler | EC2 expects new token → enter sends old → all API requests fail |
| `PLN_GPU_TOKEN` updated in SOPS but not GPU workers | EC2 sends new token → workers reject → image generation fails |
| `PLN_GPU_TOKEN` updated on workers but not SOPS | Workers expect new token → EC2 sends old → image generation fails |

**Key rule:** both sides of each trust boundary must be updated together. The scripts handle this by updating SOPS (source of truth) first, then fanning out.

## Rollback

```bash
# Get old token from git history
git log -p -- image.pollinations.ai/secrets/env.json | head -50

# Re-run with the old token
./tools/scripts/rotate-pln-enter-token.sh OLD_TOKEN
./tools/scripts/rotate-pln-gpu-token.sh OLD_TOKEN
```

Or revert the SOPS commit and redeploy.

## GPU worker details

| Worker | Pod/Host | SSH | Token location | Restart |
|--------|----------|-----|---------------|---------|
| Flux + Z-Image | RunPod `hsl3ksl31lvrcc` | `root@38.65.239.17 -p 28895 -i ~/.ssh/thomashkey` | `$HOME/.env` | Restart screen sessions |
| Klein 4B | RunPod `pi90tfk3sa9t12` | `root@213.144.200.243 -p 10207 -i ~/.runpod/ssh/RunPod-Key-Go` | `/workspace/.env` | Restart handler.py |
| LTX-2 + ACE-Step + Sana | Lambda GH200 | `ubuntu@192.222.51.105 -i ~/.ssh/thomashkey` | `$HOME/.env` | `systemctl restart ltx2 acestep sana` |

## Secrets not yet automated

| Secret | Blocker |
|--------|---------|
| `BETTER_AUTH_SECRET` | Needs multi-secret array — rotating now kills all sessions |
| `STRIPE_WEBHOOK_SECRET` | Needs dual-secret verifier |
| Provider API keys | Each provider has different rotation mechanisms |
