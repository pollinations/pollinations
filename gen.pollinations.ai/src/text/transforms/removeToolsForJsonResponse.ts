import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

/**
 * Transform that removes tools when response_format is set (JSON mode/structured output).
 *
 * Gemini/Vertex AI doesn't support combining code_execution or google_search tools
 * with controlled generation (response_format).
 *
 * See: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/gemini
 */
export function removeToolsForJsonResponse(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    const responseType = options.response_format?.type;
    const hasJsonFormat =
        responseType === "json_object" || responseType === "json_schema";

    if (!hasJsonFormat) {
        return { messages, options };
    }

    const { tools, tool_choice, ...restOptions } = options;

    return {
        messages,
        options: restOptions,
    };
}
