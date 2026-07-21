import type { TransformFn } from "../types.ts";
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
 * Converts requested Gemini built-in tools to the function-shaped format
 * expected by Portkey. Unlike createGeminiToolsTransform, this never adds a
 * tool the caller did not request.
 */
export const normalizeGeminiBuiltInTools: TransformFn = (
    messages,
    options,
) => ({
    messages,
    options: {
        ...options,
        tools: options.tools?.map((tool) => {
            if (!tool || typeof tool !== "object" || !("type" in tool)) {
                return tool;
            }

            const { type } = tool as { type?: unknown };
            return type === "code_execution" || type === "google_search"
                ? toOpenAIFunctionFormat(type)
                : tool;
        }),
    },
});

/**
 * Creates a transform that adds Gemini-specific tools (code execution, search, URL context).
 * Only applies if the user hasn't passed their own tools.
 */
export function createGeminiToolsTransform(toolNames: GeminiToolName[]) {
    return addDefaultTools(toolNames.map(toOpenAIFunctionFormat));
}
