/**
 * Creates a transform for models that return citations (e.g., Perplexity)
 * Handles both request-side (skip response_format) and response-side (append citations)
 *
 * @returns {Function} Transform function that returns { messages, options, responseTransform }
 */
export function createCitationsTransform() {
    return function transform(messages, options) {
        // Request phase: mark that we should skip response_format for this model
        // (Perplexity doesn't support response_format parameter)
        const modifiedOptions = {
            ...options,
            skipResponseFormat: true,
        };

        // Return the response transform function alongside the request modifications
        return {
            messages,
            options: modifiedOptions,
            responseTransform: appendCitations,
        };
    };
}

/**
 * Appends citations to the completion response for plain text GET requests.
 * For OpenAI-compatible responses, citations pass through as a top-level field.
 *
 * @param {Object} completion - The API completion response
 * @param {Object} options - Request options (includes isGetRequest flag)
 * @returns {Object} Modified completion with citations appended to content for GET requests
 */
function appendCitations(completion, options = {}) {
    // If no citations, return as-is
    if (
        !completion.citations ||
        !Array.isArray(completion.citations) ||
        completion.citations.length === 0
    ) {
        return completion;
    }

    // For OpenAI-compatible POST requests, citations already exist as top-level field
    // Just pass through - no modification needed
    if (!options.isGetRequest) {
        return completion;
    }

    // For plain text GET requests, append formatted citations to content
    const content = completion.choices?.[0]?.message?.content || "";
    let formattedContent = content;
    formattedContent += "\n\n---\nSources:\n";
    completion.citations.forEach((url, index) => {
        formattedContent += `[${index + 1}] ${url}\n`;
    });

    // Return modified completion with updated content
    return {
        ...completion,
        choices: [
            {
                ...completion.choices[0],
                message: {
                    ...completion.choices[0].message,
                    content: formattedContent,
                },
            },
        ],
    };
}
