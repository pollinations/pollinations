import type { TransformFn } from "../types.js";

export type SearchContextSize = "low" | "medium" | "high";

/**
 * Injects Perplexity's `web_search_options.search_context_size` into the request
 * body. This controls how much web content Sonar retrieves to ground its answer —
 * and the per-request search fee scales with it (low < medium < high).
 *
 * Always uses the registry-selected context size: the static billing fee in
 * the registry assumes it, and callers cannot supply web_search_options
 * through the public API anyway.
 */
export function createPerplexitySearchTransform(
    searchContextSize: SearchContextSize,
): TransformFn {
    return (messages, options) => ({
        messages,
        options: {
            ...options,
            web_search_options: {
                search_context_size: searchContextSize,
            },
        },
    });
}
