---
name: model-management
description: "Add, update, or remove text/image/video models. Handles any provider."
---

# Checklist

1. Update `.env` and `secrets/env.json` (sops) with credentials
2. Update config/handler with model routing
3. Update registry with **pricing** and **provider**
4. Run tests (see [Testing](#testing) below)

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
| `gen.pollinations.ai/secrets/prod.vars.json` | Encrypted secrets (use sops) |
| `image.pollinations.ai/src/createAndReturnImages.ts` | Model handlers |
| `shared/registry/image.ts` | **Pricing**, provider, aliases, description |

---

# Quick Actions

| Action | `.env` | Config/Handler | Registry |
|--------|--------|----------------|----------|
| New model | ✅ | ✅ | ✅ (pricing!) |
| Change endpoint only | ✅ | - | - |
| Change provider | ✅ | ✅ | ✅ (pricing!) |
| Make paid-only | - | - | ✅ (`paidOnly: true`) |
| Disable model | - | ✅ (remove) | ✅ (remove) |
| Upgrade model | ✅ (if provider changes) | ✅ | ✅ (pricing!) |

---

# Testing

After updating model files, run these tests from `enter.pollinations.ai/`:

```bash
# 1. Alias resolution (fast, no network) — verifies aliases map to service IDs
npx vitest run test/aliases.test.ts

# 2. Integration tests for the specific model (uses VCR snapshots)
npx vitest run test/integration/text.test.ts --testNamePattern="<service-name> "
```

**Notes:**
- VCR snapshots are auto-recorded on first run if the EC2 text service is reachable
- Run `npm run decrypt-vars` first if you haven't already

---

# Secrets (sops)

```bash
# Decrypt, inspect keys
sops --decrypt gen.pollinations.ai/secrets/prod.vars.json | python3 -c "import json,sys; [print(k) for k in json.load(sys.stdin)]"

# Add/update a key
sops set gen.pollinations.ai/secrets/prod.vars.json '["KEY_NAME"]' '"value"'

# Decrypt to .env (used before local dev/tests)
npm run decrypt-vars   # from image.pollinations.ai/
```

---

# Azure OpenAI Resources (gptimage)

## Current resources

| Resource | Region | Used for |
|----------|--------|----------|
| `myceli-prod-eastus2` | East US 2 | `gptimage` (gpt-image-1-mini), `gptimage-large` (gpt-image-1.5) |
| `myceli-prod-swedencentral` | Sweden Central | Flux Kontext, text models |

Env var: `AZURE_MYCELI_PROD_EASTUS2_API_KEY` (in `gen.pollinations.ai/secrets/prod.vars.json`)

## Login

```bash
brew install azure-cli   # if not installed
az login --use-device-code
# Use thomas@myceli.ai account
```

## If a resource gets content-policy blocked

Azure blocks the whole resource (not just one deployment). Signs: all gptimage calls return 403 with *"temporarily blocked because we detected behavior that may violate our content policy"*.

Recovery steps:
1. Check which region supports the model: `az cognitiveservices model list -l <region> --query "[?model.name=='gpt-image-1-mini']" -o json`
2. Create new resource: `az cognitiveservices account create --name myceli-prod-<region> --resource-group rg-myceli-prod --kind AIServices --sku S0 --location <region>`
3. Deploy model: `az cognitiveservices account deployment create --name <resource> --resource-group rg-myceli-prod --deployment-name gpt-image-1-mini --model-name gpt-image-1-mini --model-version 2025-10-06 --model-format OpenAI --sku-capacity 60 --sku-name GlobalStandard`
4. Get key: `az cognitiveservices account keys list --name <resource> --resource-group rg-myceli-prod --query 'key1' -o tsv`
5. Add to SOPS: `sops set gen.pollinations.ai/secrets/prod.vars.json '["AZURE_MYCELI_PROD_EASTUS2_API_KEY"]' '"<key>"'`
6. Update endpoint URLs in `createAndReturnImages.ts` (`AZURE_GPTIMAGE_CONFIGS`)
7. Delete broken deployments from old resource to free quota: `az cognitiveservices account deployment delete --name <old-resource> --resource-group rg-myceli-prod --deployment-name <deployment>`
8. Test locally: `npm run dev` then `curl -H "x-enter-token: $PLN_ENTER_TOKEN" "http://localhost:16384/prompt/a+cat?model=gptimage"`
