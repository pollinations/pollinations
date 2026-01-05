/**
 * Creates a transform for models that return citations (e.g., Perplexity).
 *
 * Request-side: Skips response_format (Perplexity doesn't support it).
 * Response-side: Citations pass through as top-level field in OpenAI response.
 * GET formatting: sendContentResponse in server.js appends citations to plain text.
 *
 * @returns {Function} Transform function
 */
export function createCitationsTransform() {
    return function transform(messages, options) {
        // Perplexity doesn't support response_format parameter
        return {
            messages,
            options: {
                ...options,
                skipResponseFormat: true,
            },
        };
    };
}
