---
name: enter-services
description: "Deploy and manage the enter.pollinations.ai Cloudflare Worker (auth gateway + billing). Requires: sops, wrangler."
---

# Requirements

Before using this skill, ensure you have:
- **sops**: `brew install sops` (for decrypting secrets)
- **Wrangler**: `npm install -g wrangler`
- **Node.js**: `brew install node`

Must run from the `pollinations` repo root.

---

# Architecture Overview

| Environment | Gateway (Cloudflare Worker) | Generation |
|-------------|----------------------------|------------|
| **Production** | `enter.pollinations.ai` | `gen.pollinations.ai` Worker |
| **Staging** | `staging.enter.pollinations.ai` | `staging.gen.pollinations.ai` Worker |

The former `enter-services` / `enter-services-staging` EC2 boxes
(`text-pollinations.service`, `image-pollinations.service`) are decommissioned;
text and image generation run inside the `gen.pollinations.ai` Worker. The
Discord bots that lived on `enter-services` now run on the `monitoring-agents`
EC2 box — see `apps/discord-bot-family/README.md` and
`operations/infrastructure/gpu/GPU_INSTANCES.md`.

---

# Deploy Cloudflare Worker (enter.pollinations.ai)

Production deploys only through GitHub Actions (`Deploy / Cloudflare
production`, dispatched from the `production` branch) — never
`wrangler deploy --env production` from a local machine. See AGENTS.md
"Cloudflare Production Deployment Safety".

```bash
cd enter.pollinations.ai
npm run deploy:staging   # staging only
```

---

# Wrangler Configuration

The `wrangler.toml` contains environment configs:

| Environment | Route | Service URLs |
|-------------|-------|--------------|
| `production` | `enter.pollinations.ai` | `gen.pollinations.ai` |
| `staging` | `staging.enter.pollinations.ai` | `staging.gen.pollinations.ai` |
| `local` | `localhost:3000` | Local dev |

---

# Token Rotation

Internal trust-boundary tokens (`PLN_ENTER_TOKEN`, `PLN_GPU_TOKEN`, Tinybird
tokens, SOPS recipients): see [token-rotation.md](token-rotation.md) for the
inventory, rotation mechanisms, deploy path, and rollback.

---

# Notes

- **Production** deploys on push to `production` branch
- **Staging** deploys on push to `staging` branch
- Always test on staging before merging to production
- `enter.pollinations.ai` handles auth/billing; generation requests are served by the `gen.pollinations.ai` Worker
