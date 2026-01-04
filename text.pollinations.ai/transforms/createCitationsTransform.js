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
 * Appends citations to the completion response
 * For plain text responses, formats citations as a Sources section
 * For JSON mode, returns structured { content, citations } object
 *
 * @param {Object} completion - The API completion response
 * @param {Object} options - Request options (includes jsonMode flag)
 * @returns {Object} Modified completion with citations appended
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

    const content = completion.choices?.[0]?.message?.content || "";
    const citations = completion.citations;

    // For JSON mode, mark completion for special JSON response handling
    if (options.jsonMode) {
        return {
            ...completion,
            _citationsResponse: { content, citations },
        };
    }

    // For plain text, append formatted citations to content
    let formattedContent = content;
    formattedContent += "\n\n---\nSources:\n";
    citations.forEach((url, index) => {
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
