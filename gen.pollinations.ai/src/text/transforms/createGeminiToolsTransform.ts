import { addDefaultTools } from "./pipe.ts";

export type GeminiToolName = "code_execution" | "google_search";

/**
 * Converts a Gemini tool name to the OpenAI function format expected by Portkey gateway.
 */
function toOpenAIFunctionFormat(name: GeminiToolName) {
    return {
        type: "function" as const,
        function: { name },
    };
}

/**
 * Creates a transform that adds Gemini-specific tools (code execution, search, URL context).
 * Only applies if the user hasn't passed their own tools.
 */
export function createGeminiToolsTransform(toolNames: GeminiToolName[]) {
    return addDefaultTools(toolNames.map(toOpenAIFunctionFormat));
}

/** Adds OpenRouter's provider-native Google Search tool without an Exa route. */
export function createOpenRouterNativeWebSearchTransform() {
    return addDefaultTools([
        {
            type: "openrouter:web_search",
            parameters: { engine: "native" },
        },
    ]);
}
