# Agent Guidelines for MCP Server Development

## Design Principles

1. **Thin proxy, single gateway.** All API calls go through `gen.pollinations.ai`. Do not add local model, default, pricing, or error policy.
2. **Eight tools.** Keep the public surface at `listModels`, `chatCompletion`, `generateImage`, `generateVideo`, `textToSpeech`, `transcribeAudio`, `getBalance`, and `getUsage`. Extend these request schemas instead of adding semantic wrappers.
3. **Raw pass-through.** Forward request fields and preserve upstream JSON. Reshape only when MCP requires a content block for binary image, video, or audio data.
4. **Stateless authentication.** Hosted credentials come from request context. Stdio credentials come from `POLLINATIONS_API_KEY`. Never add mutable credential tools or process-global request credentials.

## Structure

```
packages/mcp/
  src/
    index.js                     # stdio bootstrap
    server.js                    # shared stateless server and tool registration
    services/
      imageService.js            # generateImage, generateVideo
      textService.js             # chatCompletion, listModels
      audioService.js            # textToSpeech, transcribeAudio
      accountService.js          # getBalance, getUsage
    utils/
      authUtils.js               # request/environment auth projection
      coreUtils.js               # Gen URL, fetch, and MCP content helpers
```

The hosted Streamable HTTP Worker is in `apps/mcp/` and must expose the same eight tools as stdio.

## Stdio Discipline

The MCP server speaks JSON-RPC over stdio. Never use `console.log` in modules imported by `src/index.js`; stdout is the protocol. Test scripts may log normally.

## Changes

- Use `z.string()` for model and voice names. Gen validates the live registry.
- Keep tool schemas `.passthrough()` when Gen supports provider extensions.
- Do not parse the first choice, invent defaults, rewrite errors, upload media to another service, or filter registry fields.
- Streaming chat is unsupported because an MCP tool result is finite; reject it explicitly.
- Preserve URL-source protections and body cancellation when changing media tools.
- Update the exact tool lists in both `packages/mcp/test-mcp-client.js` and `apps/mcp/worker.test.js`.

## Testing

- `npm test` in `packages/mcp/`
- `node --test worker.test.js` in `apps/mcp/`
- Pack and inspect the npm tarball before publishing a version change.
