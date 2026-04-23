# Agent Guidelines for MCP Server Development

## Design Principles

1. **Thin proxy, single gateway.** All HTTP goes through `gen.pollinations.ai`. Do not add second hostnames (e.g. direct `enter.pollinations.ai` or `media.pollinations.ai`) — use the gateway's rewrites (`/account/*`, `/image/*`, `/text/*`, `/audio/*`, `/v1/*`).
2. **No hardcoded model or voice enums.** Validate against the live registry via `utils/models.js` (5-minute cache). Tool param schemas should be `z.string()` with a "use listX for the live list" hint.
3. **Don't transform response data.** Pass through API responses; only reshape when an MCP content-block is required (e.g. wrap binary as base64 image/audio).
4. **Minimal tool surface.** Every tool is extra context for the LLM to reason over and a chance to pick the wrong one. Add only what's genuinely useful inside a host (Claude Desktop, Cursor, etc.).

## File Structure

```
packages/mcp/
  pollinations-mcp.js            # bin wrapper → calls startMcpServer()
  src/
    index.js                     # server bootstrap, tool registration, instructions
    services/
      imageService.js            # generateImage(Url|Batch), generateVideo(Url), describeImage, analyzeVideo, listImageModels
      textService.js             # generateText, chatCompletion, webSearch, listTextModels, getPricing
      audioService.js            # respondAudio, sayText, transcribeAudio, listAudioVoices
      authService.js             # setApiKey, getKeyInfo, clearApiKey  (local only — no API calls)
      accountService.js          # getBalance, getUsage                (via /account/*)
    utils/
      authUtils.js               # in-memory key store, header/query builders
      coreUtils.js               # fetch wrappers, URL builders, chatWithMedia helper, error mapping
      models.js                  # registry fetchers + validators (cached 5 min)
```

## Stdio Discipline

The MCP server speaks JSON-RPC over stdio. `console.log` corrupts the protocol.

- **Never** use `console.log` in any module imported by `src/index.js`.
- Use `console.error` sparingly for diagnostics (goes to stderr, safe).
- Test scripts run standalone — `console.log` is fine there.

## Adding a Tool

1. Add the handler to the relevant service file (or create a new one for a new domain).
2. Export a `[name, description, zodShape, handler]` entry in a tool array.
3. Import the array into `src/index.js` and spread it into `allTools`.
4. Update the `SERVER_INSTRUCTIONS` blurb with a one-line entry.
5. Update `README.md`'s tool table.

## Validation Pattern

```js
import { validateImageModel } from "../utils/models.js";

const result = await validateImageModel(model);
if (!result.valid) {
    throw new Error(
        `${result.error} Did you mean: ${result.suggestions.join(", ")}?`,
    );
}
```

Cache is shared across all tool calls within a process — don't roll your own fetcher for model lists.

## Media-Chat Helper

`describeImage`, `analyzeVideo`, `transcribeAudio` all call `/v1/chat/completions` with a single media block. Use `chatWithMedia({ model, prompt, mediaType, mediaUrl })` from `coreUtils.js` — do not re-inline the fetch+parse boilerplate.

## Testing

- `npm run test` — `test-mcp-client.js` runs the server end-to-end over stdio.
- `npm run test:integration` — vitest integration suite.
- Restart Claude Desktop after any change — it caches the running MCP process.
