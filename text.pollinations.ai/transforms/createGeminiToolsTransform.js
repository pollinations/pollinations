import { addDefaultTools } from "./pipe.js";

/**
 * Creates a transform that adds Gemini tools for enhanced capabilities
 * Only applies if user hasn't passed their own tools
 * @param {string[]} toolNames - Tool names to add (defaults to all: code_execution, google_search, url_context)
 * @returns {Function} Transform function that adds Gemini tools as defaults
 */
export function createGeminiToolsTransform(
    toolNames = ["code_execution", "google_search", "url_context"],
) {
    return addDefaultTools(toolNames.map((name) => ({ type: name })));
}
