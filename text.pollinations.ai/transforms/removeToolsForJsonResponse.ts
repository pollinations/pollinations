/**
 * Transform that removes tools when response_format is set (JSON mode/structured output)
 *
 * This is needed because Gemini/Vertex AI doesn't support combining:
 * - code_execution tool with controlled generation (response_format)
 * - google_search tool with controlled generation
 *
 * Error: "controlled generation is not supported with Code Execution tool"
 * See: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/gemini
 *
 * @param messages - Array of message objects
 * @param options - Request options that may contain response_format and tools
 * @returns Object with messages and options (tools removed if response_format is set)
 */
export function removeToolsForJsonResponse(messages: any[], options: any) {
    // Check if response_format is set (JSON mode or JSON schema)
    const hasResponseFormat =
        options.response_format &&
        (options.response_format.type === "json_object" ||
            options.response_format.type === "json_schema");

    if (!hasResponseFormat) {
        // No JSON response requested, keep tools as-is
        return { messages, options };
    }

    // Remove tools to avoid Vertex AI conflict
    const { tools, tool_choice, ...restOptions } = options;

    return {
        messages,
        options: restOptions,
    };
}
