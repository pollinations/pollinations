# Changelog

All notable changes to `@pollinations/react` will be documented in this file.

## [3.0.0] - 2024-12-05

### ⚠️ Breaking Changes

-   **New API Gateway**: All hooks now use `enter.pollinations.ai` instead of legacy endpoints
-   **New return shape**: `usePollinationsText` now returns `{ data, isLoading, error }` instead of just `string | null`
-   **TypeScript rewrite**: Full TypeScript source (no more separate `.d.ts` files)

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
-   `usePollinationsImage` unchanged (still returns URL string)
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

```tsx
// v2.x
const { sendUserMessage, messages } = usePollinationsChat([], {
    model: "openai",
});

// v3.x
const { sendMessage, messages, isLoading, error, reset } = usePollinationsChat(
    [],
    { model: "openai" }
);
```

---

## [2.0.8] - Previous

See [pollinations-react](../pollinations-react/README.md) for v2.x changelog.
