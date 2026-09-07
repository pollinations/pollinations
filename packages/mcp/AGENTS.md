# Agent Guidelines for MCP Server Development

## Design Principles

1. **Thin proxy.** API calls go through `gen.pollinations.ai`; generated binary outputs are uploaded unlisted to `media.pollinations.ai` and returned as resource links. Do not call other service hosts directly — use the gateway's rewrites (`/account/*`, `/image/*`, `/text/*`, `/audio/*`, `/v1/*`).
2. **No hardcoded model or voice enums.** Validate against the live registry via `utils/models.js`. Tool param schemas should be `z.string()` with a "use listX for the live list" hint.
3. **Don't transform response data.** Pass through API responses; only reshape when an MCP content block is required (for example, upload generated binary output and return a resource link).
4. **Minimal tool surface.** Every tool is extra context for the LLM to reason over and a chance to pick the wrong one. Add only what's genuinely useful inside a host (Claude Desktop, Cursor, etc.).
5. **Stateless HTTP only.** Read the bearer token from the request context. Do not add process-local state, authentication tools, sessions, or stdio entrypoints.

## File Structure

```
packages/mcp/
  src/
    server.js                    # server factory, tool registration, instructions
    services/
      imageService.js            # generateImage, generateVideo
      textService.js             # generateText
      audioService.js            # generateAudio
      embeddingService.js        # createEmbeddings
      model3dService.js           # generate3D
      discoveryService.js        # listModels, getModelStatus
      accountService.js          # getBalance                          (via /account/*)
    utils/
      authUtils.js               # request-scoped bearer auth
      coreUtils.js               # fetch wrappers, URL builders, error mapping
      models.js                  # registry fetchers + validators
```

## Stateless HTTP Discipline

The public server uses Streamable HTTP without MCP sessions. Credentials belong
to one request and must never be stored in module state.

## Adding a Tool

1. Add the handler to the relevant service file (or create a new one for a new domain).
2. Export a `[name, description, zodShape, handler]` entry in a tool array.
3. Import the array into `src/server.js` and spread it into `tools`.
4. Update the `SERVER_INSTRUCTIONS` blurb with a one-line entry.
5. Update `README.md`'s tool table.

## Validation Pattern

```js
import { validateImageModel } from "../utils/models.js";

const result = await validateImageModel(model);
if (!result.valid) {
    throw new Error(`${result.error} Use listModels for the live registry.`);
}
```

## Testing

- `npm run test` in `packages/mcp` — focused tool-handler tests.
- `npm run test` in `apps/mcp` — Streamable HTTP worker tests.
