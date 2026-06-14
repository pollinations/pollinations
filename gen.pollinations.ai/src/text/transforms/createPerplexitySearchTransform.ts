import type { TransformFn } from "../types.js";

export type SearchContextSize = "low" | "medium" | "high";

/**
 * Injects Perplexity's `web_search_options.search_context_size` into the request
 * body. This controls how much web content Sonar retrieves to ground its answer —
 * and the per-request search fee scales with it (low < medium < high).
 *
 * Respects a caller-provided `web_search_options` if present (user intent wins).
 */
export function createPerplexitySearchTransform(
    searchContextSize: SearchContextSize,
): TransformFn {
    return (messages, options) => ({
        messages,
        options: {
            ...options,
            web_search_options: options.web_search_options ?? {
                search_context_size: searchContextSize,
            },
        },
    });
}
