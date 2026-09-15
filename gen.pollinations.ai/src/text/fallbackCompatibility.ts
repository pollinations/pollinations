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

function requestedCompletionTokens(request: Record<string, unknown>): number {
    return Math.max(
        0,
        ...["max_tokens", "max_completion_tokens", "max_output_tokens"].map(
            (key) => (typeof request[key] === "number" ? request[key] : 0),
        ),
    );
}

function hasToolHistory(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(hasToolHistory);
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    return (
        item.role === "tool" ||
        item.role === "function" ||
        item.type === "function_call" ||
        item.type === "function_call_output" ||
        item.function_call != null ||
        (Array.isArray(item.tool_calls) && item.tool_calls.length > 0) ||
        Object.values(item).some(hasToolHistory)
    );
}

/** Whether a fallback route can honor this text request's public contract. */
export function supportsTextFallbackRequest(
    definition: ModelDefinition | undefined,
    request: Record<string, unknown>,
): boolean {
    if (!definition) return true;
    if (
        definition.unsupportedParameters?.some(
            (parameter) => request[parameter] != null,
        ) ||
        (definition.tools === false &&
            (hasToolHistory(request.messages) || hasToolHistory(request.input)))
    ) {
        return false;
    }
    if (
        definition.maxRequestBytes !== undefined &&
        new TextEncoder().encode(JSON.stringify(request)).byteLength >
            definition.maxRequestBytes
    ) {
        return false;
    }
    if (
        definition.supportsForcedToolChoice === false &&
        (forcesToolChoice(request.tool_choice) ||
            forcesToolChoice(request.function_call))
    ) {
        return false;
    }
    if (
        definition.maxCompletionTokens !== undefined &&
        requestedCompletionTokens(request) > definition.maxCompletionTokens
    ) {
        return false;
    }
    return (
        definition.maxReferenceImages === undefined ||
        countReferenceImages(request) <= definition.maxReferenceImages
    );
}
