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
| Make paid-only | - | - | ✅ (`paidOnly: true`) |
| Disable model | - | ✅ (remove) | ✅ (remove) |
| Upgrade model | ✅ (if provider changes) | ✅ | ✅ (pricing!) + keep old as hidden legacy |

---

# Hidden/Legacy Models

When **upgrading** a model (e.g. M2.1 → M2.5), keep the old version accessible as a hidden legacy entry so existing users who request it by name aren't broken.

**Pattern** (follow `claude-legacy` / `gemini-legacy` examples):

1. **Registry** (`shared/registry/text.ts`): Add a `"<name>-legacy"` entry with `hidden: true` and the old aliases/modelId
2. **Config** (`modelConfigs.ts`): Keep the old provider config entry alongside the new one
3. **Available models** (`availableModels.ts`): Add a `"<name>-legacy"` model definition pointing to the old config

Hidden models are filtered from `/models` endpoints and dashboards but remain usable via API when requested by alias.

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
- Hidden/legacy models won't have snapshots and will fail integration tests — this is expected
- Run `npm run decrypt-vars` first if you haven't already
- The alias test covers ALL models including hidden ones

---

# Secrets (sops)

```bash
sops -d <service>/secrets/env.json > /tmp/plain.json
# Edit with jq or manually
cp /tmp/plain.json <service>/secrets/env.json
sops -e -i <service>/secrets/env.json
rm /tmp/plain.json
```
