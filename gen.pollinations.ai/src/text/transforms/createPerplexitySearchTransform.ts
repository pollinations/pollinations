import type { TransformFn } from "../types.js";

export type SearchContextSize = "low" | "medium" | "high";

/**
 * Injects Perplexity's `web_search_options.search_context_size` into the request
 * body. This controls how much web content Sonar retrieves to ground its answer —
 * and the per-request search fee scales with it (low < medium < high).
 *
 * Uses the registry-selected context size as the default. If a caller supplied
 * `web_search_options.search_context_size`, preserve it so billing fallback can
 * match the actual request tier.
 */
export function createPerplexitySearchTransform(
    searchContextSize: SearchContextSize,
): TransformFn {
    return (messages, options) => {
        const webSearchOptions =
            typeof options.web_search_options === "object" &&
            options.web_search_options !== null
                ? options.web_search_options
                : {};

        return {
            messages,
            options: {
                ...options,
                web_search_options: {
                    ...webSearchOptions,
                    search_context_size:
                        webSearchOptions.search_context_size ??
                        searchContextSize,
                },
            },
        };
    };
}
