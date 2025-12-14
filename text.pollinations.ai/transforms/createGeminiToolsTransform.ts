import { addDefaultTools } from "./pipe.js";

export type GeminiToolName = "code_execution" | "google_search" | "url_context";

/**
 * Creates a transform that adds Gemini tools for enhanced capabilities
 * Only applies if user hasn't passed their own tools
 */
export function createGeminiToolsTransform(
    toolNames: GeminiToolName[] = [
        "code_execution",
        "google_search",
        "url_context",
    ],
) {
    return addDefaultTools(toolNames.map((name) => ({ type: name })));
}
