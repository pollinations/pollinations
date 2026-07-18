# Agent Guidelines for MCP Server Development

## Design Principles

1. **Thin proxy, single authority.** All HTTP goes through `gen.pollinations.ai`. Gen owns model defaults, aliases, modality support, voice support, request validation, and API errors.
2. **Discovery registries, not preflights.** Model and voice registries exist to inform clients. Do not fetch a registry before a generation request or reject inputs locally based on registry contents.
3. **Do not reshape API data.** Return Gen JSON unchanged inside an MCP text content block. Only convert data when the MCP protocol requires it, such as binary image or audio content.
4. **Minimal tool surface.** Prefer one composable tool over convenience variants. Every tool adds model context and another opportunity to select the wrong operation.
5. **Environment-only secrets.** Read `POLLINATIONS_API_KEY` from the server process environment. Never accept, store, inspect, or clear API keys through model-visible tools.

## File Structure

```text
packages/mcp/
  src/
    index.js                     # server entrypoint and tool registration
    services/
      imageService.js            # image/video generation
      textService.js             # chat completion and model discovery
      audioService.js            # audio response and speech generation
      accountService.js          # balance and usage via /account/*
    utils/
      authUtils.js               # immutable environment authentication
      coreUtils.js               # gateway fetch and MCP content helpers
```

## Stdio Discipline

The server speaks JSON-RPC over stdio. `console.log` in imported server modules corrupts the protocol.

- Never use `console.log` in modules imported by `src/index.js`.
- Use `console.error` sparingly for diagnostics.
- Standalone test scripts may use `console.log`.

## Adding a Tool

1. Confirm an existing tool cannot express the operation.
2. Keep the handler as a direct Gen request with only MCP content wrapping.
3. Export `[name, description, zodShape, handler]` from the relevant service.
4. Register its service array in `src/index.js`.
5. Update the concise tool table in `README.md`.

Do not add model or voice enums, registry preflight checks, response summaries, compatibility aliases, or convenience wrappers.

Use `chatCompletion` directly for image, video, and audio analysis instead of adding fixed-prompt convenience tools.

## Testing

- `npm test` runs the end-to-end stdio smoke test without authenticated calls.
- `POLLINATIONS_API_KEY=sk_… npm test` also exercises authenticated tools.
- Restart MCP hosts after changes because they cache the running server process.
