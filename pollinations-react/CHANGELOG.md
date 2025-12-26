# Changelog

All notable changes to `@pollinations/react` will be documented in this file.

## [3.0.1] - 2025-12-24

### Fixed

-   Fixed all hooks pointing to correct `gen.pollinations.ai` endpoints:
    - Text: `GET /text/{prompt}` with query parameters
    - Chat: `POST /v1/chat/completions`
    - Image: `GET /image/{prompt}` with query parameters
    - Text models: `GET /text/models`
    - Image models: `GET /image/models`
-   `usePollinationsText` now uses GET requests with URI-encoded prompts (matching image behavior)
-   `usePollinationsImage` now returns consistent `{ data, isLoading, error }` object instead of string
-   Added AbortController to `usePollinationsChat` for proper request cancellation
-   Added input validation: seed (32-bit), model (non-empty string), dimensions (64-2048px)
-   Added JSON parse error handling with try-catch blocks
-   Added systemPrompt whitespace validation
-   Added type parameter validation for `usePollinationsModels` ("text" or "image")
-   Fixed CHANGELOG claims about TypeScript (source remains JavaScript with TypeScript definitions)

## [3.0.0] - 2024-12-05

### ⚠️ Breaking Changes

-   **New API Gateway**: All hooks now use `gen.pollinations.ai` instead of legacy endpoints
-   **New return shape**: `usePollinationsText` now returns `{ data, isLoading, error }` instead of just `string | null`
-   **TypeScript rewrite**: Full TypeScript type definitions (separate `.d.ts` files)

### Added

-   `usePollinationsModels` hook to fetch available models
-   `apiKey` option for all hooks (supports `pk_` and `sk_` keys)
-   AbortController support for request cancellation
-   Consistent `{ data, isLoading, error }` return pattern
-   ESM and CommonJS dual build
-   Source maps for debugging

### Changed

-   `usePollinationsText` returns `UseTextResult` object instead of raw string
-   `usePollinationsChat` returns `UseChatResult` with `sendMessage`, `reset`, `isLoading`, `error`
-   `usePollinationsImage` now returns object instead of URL string
-   Default model changed to `openai` for text, `flux` for images

### Removed

-   `lodash.memoize` dependency (uses React built-in memoization)
-   Legacy `text.pollinations.ai` and `image.pollinations.ai` endpoints

## Migration from v2.x

```tsx
// v2.x
const text = usePollinationsText("prompt", { model: "openai" });
if (text) {
    /* use text */
}

// v3.x
const { data, isLoading, error } = usePollinationsText("prompt", {
    model: "openai",
});
if (data) {
    /* use data */
}
```
