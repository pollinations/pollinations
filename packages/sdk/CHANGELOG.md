# Changelog

All notable changes to `@pollinations_ai/sdk` will be documented in this file.

## [4.1.0] - 2026-03-05

### Added
- **Speech-to-Text (STT)**: `transcribe()` method and helper for audio transcription via `/v1/audio/transcriptions` (whisper-large-v3, scribe models)
- **Media Upload**: `upload()` method for uploading images, audio, and video to `media.pollinations.ai` with content-addressed deduplication
- **BYOP (Bring Your Own Pollen)**: `authorizeUrl()` to build authorization URLs that let users grant apps access to their Pollen balance with model/budget/permission scoping
- **Account endpoints**:
  - `accountProfile()` / `getProfile()` - Get user profile (name, email, tier)
  - `accountBalance()` / `getBalance()` - Get pollen balance
  - `accountUsage()` / `getUsage()` - Get detailed usage history with pagination
  - `accountUsageDaily()` / `getDailyUsage()` - Get daily aggregated usage
  - `validateKey()` - Validate API key and inspect permissions, budget, expiry
- New types: `TranscribeOptions`, `TranscriptionResponse`, `TranscriptionVerboseResponse`, `UploadOptions`, `UploadResponse`, `AuthorizeOptions`, `AccountProfile`, `AccountBalance`, `UsageRecord`, `UsageResponse`, `DailyUsageRecord`, `DailyUsageResponse`, `KeyInfo`, `AccountPermission`

## [4.0.1] - 2026-01-10

### Changed
- Removed React hooks (will be re-added in future release)
- Removed feed subscriptions (used deprecated endpoints)
- Reorganized package to `packages/sdk` directory structure
- Simplified build configuration
- All endpoints now use gen.pollinations.ai

## [3.0.3] - 2026-01-10

### Fixed 
- Created a single sdk package with react + frontend + backend support.
- Updated README.md to reflect new usage instructions for react hooks from '@pollinations_ai/sdk'.

### Renamed 
- Renamed package from `pollinations-react` to `@pollinations_ai/sdk`.

### Improved
- Updated package.json with new name, version, description, and keywords and authors.
- Updated tsup.config.ts to build a single package instead of separate react and node builds.
- Updated src/index.ts to export react hooks and types from a single entry point.

## [3.0.2] - 2026-01-10

### Improved
-   Enhanced error handling for network issues and invalid responses across all hooks
-  Added video generation support with `usePollinationsVideo` hook:
    - `GET /video/{prompt}` with query parameters
    - Supports options: model, seed, duration, fps, dimensions
- Updated the index.d.ts file to include type definitions for `usePollinationsVideo`

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
