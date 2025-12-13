import { addDefaultTools } from "./pipe.js";

/**
 * Creates a transform that adds default Gemini tools for enhanced capabilities
 * Only applies if user hasn't passed their own tools
 * Includes: code_execution, google_search, and url_context
 * These tools enable the model to:
 * - Execute Python code for calculations and data processing
 * - Search the web for real-time information
 * - Read and ground responses on specific URLs
 * @returns {Function} Transform function that adds Gemini tools as defaults
 */
export function createGeminiToolsTransform() {
    return addDefaultTools([
        { type: "code_execution" },
        { type: "google_search" },
        { type: "url_context" },
    ]);
}
