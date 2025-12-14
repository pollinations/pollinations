import { addDefaultTools } from "./pipe.js";

/** All available Gemini native tools */
export const GEMINI_TOOLS = {
    code_execution: { type: "code_execution" },
    google_search: { type: "google_search" },
    url_context: { type: "url_context" },
};

/**
 * Creates a transform that adds Gemini tools for enhanced capabilities
 * Only applies if user hasn't passed their own tools
 * @param {Array} tools - Array of tool objects to add (defaults to all tools)
 * @returns {Function} Transform function that adds Gemini tools as defaults
 * @example
 * // All tools (code_execution, google_search, url_context)
 * createGeminiToolsTransform()
 * // Only search and url_context (no code_execution)
 * createGeminiToolsTransform([GEMINI_TOOLS.google_search, GEMINI_TOOLS.url_context])
 */
export function createGeminiToolsTransform(
    tools = [
        GEMINI_TOOLS.code_execution,
        GEMINI_TOOLS.google_search,
        GEMINI_TOOLS.url_context,
    ],
) {
    return addDefaultTools(tools);
}
