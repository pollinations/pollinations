import type { ModelDefinition } from "@shared/registry/registry.ts";

function forcesToolChoice(toolChoice: unknown): boolean {
    if (toolChoice === "required") return true;
    if (!toolChoice || typeof toolChoice !== "object") return false;

    const choice = toolChoice as { mode?: unknown; type?: unknown };
    return !(
        choice.type === "allowed_tools" &&
        (choice.mode === undefined || choice.mode === "auto")
    );
}

function countReferenceImages(value: unknown): number {
    if (Array.isArray(value)) {
        return value.reduce(
            (total, item) => total + countReferenceImages(item),
            0,
        );
    }
    if (!value || typeof value !== "object") return 0;

    const record = value as Record<string, unknown>;
    if (record.type === "image_url" || record.type === "input_image") return 1;
    return Object.values(record).reduce<number>(
        (total, item) => total + countReferenceImages(item),
        0,
    );
}

function requestHasVideoInput(value: unknown): boolean {
    if (Array.isArray(value)) {
        return value.some((item) => requestHasVideoInput(item));
    }
    if (!value || typeof value !== "object") return false;

    const record = value as Record<string, unknown>;
    if (record.type === "video_url" || record.type === "input_video") {
        return true;
    }
    return Object.values(record).some((item) => requestHasVideoInput(item));
}

function requestedCompletionTokens(request: Record<string, unknown>): number {
    return Math.max(
        0,
        ...["max_tokens", "max_completion_tokens", "max_output_tokens"].map(
            (key) => (typeof request[key] === "number" ? request[key] : 0),
        ),
    );
}

function hasToolHistory(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    // Chat messages and Responses input items carry tool history at this level.
    // Do not recurse into user content or function argument JSON.
    return value.some(
        (item) =>
            item &&
            typeof item === "object" &&
            (item.role === "tool" ||
                item.role === "function" ||
                item.type === "function_call" ||
                item.type === "function_call_output" ||
                item.function_call != null ||
                (Array.isArray(item.tool_calls) && item.tool_calls.length > 0)),
    );
}

function requestsStructuredOutput(format: unknown): boolean {
    return (
        !!format &&
        typeof format === "object" &&
        "type" in format &&
        format.type !== "text"
    );
}

/** Validate declared text capabilities before any provider attempt. */
export function textCapabilityError(
    definition: ModelDefinition | undefined,
    request: Record<string, unknown>,
): string | undefined {
    if (!definition) return;
    if (
        definition.tools === false &&
        ((Array.isArray(request.tools) && request.tools.length > 0) ||
            (Array.isArray(request.functions) &&
                request.functions.length > 0) ||
            forcesToolChoice(request.tool_choice) ||
            forcesToolChoice(request.function_call) ||
            hasToolHistory(request.messages) ||
            hasToolHistory(request.input))
    )
        return "This model does not support tool calling or tool history";
    const text = request.text as { format?: unknown } | undefined;
    if (
        definition.supportsStructuredOutput === false &&
        (requestsStructuredOutput(request.response_format) ||
            requestsStructuredOutput(text?.format))
    )
        return "This model does not support structured output; use text format";
    if (
        definition.maxCompletionTokens !== undefined &&
        requestedCompletionTokens(request) > definition.maxCompletionTokens
    )
        return `This model supports at most ${definition.maxCompletionTokens} output tokens`;
    if (
        definition.maxReferenceImages !== undefined &&
        countReferenceImages(request) > definition.maxReferenceImages
    )
        return `This model supports at most ${definition.maxReferenceImages} reference images`;
    if (
        requestHasVideoInput(request) &&
        !definition.inputModalities?.includes("video")
    )
        return "This model does not support video input";
}

/** Whether a fallback route can honor this text request's public contract. */
export function supportsTextFallbackRequest(
    definition: ModelDefinition | undefined,
    request: Record<string, unknown>,
): boolean {
    return textCapabilityError(definition, request) === undefined;
}
