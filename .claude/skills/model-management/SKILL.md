---
name: model-management
description: "Add, update, or remove text/image/video models. Handles any provider."
---

# Checklist

1. Update `.env` and `secrets/env.json` (sops) with credentials
2. Update config/handler with model routing
3. Update registry with **pricing** and **provider**

> ⚠️ **Pricing depends on BOTH model AND provider.** Always verify pricing on the provider's website.

---

# Files to Update

## Text Models

| File | Purpose |
|------|---------|
| `text.pollinations.ai/.env` | API keys, endpoints |
| `text.pollinations.ai/secrets/env.json` | Encrypted secrets (use sops) |
| `text.pollinations.ai/configs/modelConfigs.ts` | Model routing config |
| `text.pollinations.ai/availableModels.ts` | Service name → config mapping |
| `shared/registry/text.ts` | **Pricing**, provider, aliases, description |

## Image/Video Models

| File | Purpose |
|------|---------|
| `image.pollinations.ai/.env` | API keys, endpoints |
| `image.pollinations.ai/secrets/env.json` | Encrypted secrets (use sops) |
| `image.pollinations.ai/src/createAndReturnImages.ts` | Model handlers |
| `shared/registry/image.ts` | **Pricing**, provider, aliases, description |

---

# Quick Actions

| Action | `.env` | Config/Handler | Registry |
|--------|--------|----------------|----------|
| New model | ✅ | ✅ | ✅ (pricing!) |
| Change endpoint only | ✅ | - | - |
| Change provider | ✅ | ✅ | ✅ (pricing!) |

---

# Secrets (sops)

```bash
sops -d <service>/secrets/env.json > /tmp/plain.json
# Edit with jq or manually
cp /tmp/plain.json <service>/secrets/env.json
sops -e -i <service>/secrets/env.json
rm /tmp/plain.json
```
