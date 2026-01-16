import { addDefaultTools } from "./pipe.ts";

export type GeminiToolName = "code_execution" | "google_search" | "url_context";

/**
 * Converts a Gemini tool name to the OpenAI function format expected by Portkey gateway
 * The gateway only processes tools with type === "function" and transforms them to Vertex AI format
 */
function toOpenAIFunctionFormat(name: GeminiToolName) {
    return {
        type: "function" as const,
        function: {
            name,
        },
    };
}

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
    return addDefaultTools(toolNames.map(toOpenAIFunctionFormat));
}
