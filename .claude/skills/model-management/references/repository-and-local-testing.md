# Repository and local testing

Read live code before relying on this map; paths evolve.

## Source-of-truth map

| Surface | Primary locations |
|---|---|
| Public registries | `shared/registry/{text,image,audio,embeddings,realtime,model3d}.ts` |
| Registry conversion and prices | `shared/registry/registry.ts`, `shared/registry/price-helpers.ts`, `shared/registry/usage-headers.ts` |
| Text routing | `gen.pollinations.ai/src/text/configs/modelConfigs.ts`, `providerConfigs.ts`, `availableModels.ts` |
| Image and video | `gen.pollinations.ai/src/image/`, especially dispatch, params, models, and provider handlers |
| Audio and speech | `gen.pollinations.ai/src/routes/audio.ts` and transcription/realtime routes |
| Embeddings | `gen.pollinations.ai/src/embeddings/` |
| Billing and observability | `gen.pollinations.ai/src/middleware/track.ts`, `enter.pollinations.ai/observability/` |
| Catalog logo | model-info/brand mapping under the Enter frontend and `frontend/public/brand-logos/` |
| Provider secrets | encrypted files under `gen.pollinations.ai/secrets/`; mutations follow `AGENTS.md` |

Search for the canonical slug, aliases, provider model ID, registry key, and handler before adding code. Reuse existing provider clients, request transforms, polling, upload, response, error, billing, and fallback utilities.

## Local topology

Generation, permissions, billing deductions, and Tinybird tracking run in Gen. Pure model work normally needs only local Gen at `http://localhost:8788`. Start Enter only when changing an Enter-owned dashboard, auth, account, Stripe, database, or Tinybird schema surface.

Use the scripts defined by the repository:

```bash
(cd gen.pollinations.ai && npm run dev)
(cd gen.pollinations.ai && npm run seed:local)
source _local/.env
```

Use `npm run dev`, not a bare Worker command, so the current bundle and persisted local database are used. If local authenticated calls return 401, rerun `seed:local`; do not print or replace a token.

| Target | Token variable | Billing workspace |
|---|---|---|
| Local Gen | `POLLINATIONS_TOKEN_LOCAL` | staging |
| Staging Gen | `POLLINATIONS_TOKEN_STAGING` | staging |
| Production Gen | `POLLINATIONS_TOKEN_PROD` | production |

Test tokens are references in `_local/.env`; provider credentials are not. Never print secret values. Any provider-secret mutation requires the separate approval and PR process in `AGENTS.md`.

## Minimum smoke

Call the public route shape through local Gen with the canonical model ID and authenticated local token. A successful direct-provider probe is not a substitute for this test: local E2E must prove registry resolution, request transforms, handler behavior, permissions, billing, and response mapping together.

Also inspect `/v1/models` or the modality-specific catalog endpoint to verify the public entry, aliases, access, price, modalities, capabilities, description, and logo.

## Focused automated checks

- Run the existing alias, pricing, permission, usage-header, cache, billing, tracking, safety, and modality-specific tests touched by the change.
- Extend existing tests rather than introducing mock infrastructure.
- Run type checks for every touched worker/package.
- Run `npx biome check --write <changed-files>` before committing.
- Do not edit tests merely to bless incorrect behavior; fix the implementation.
