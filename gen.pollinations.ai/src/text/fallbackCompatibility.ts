import {
    type CommunityEndpointRuntime,
    usesAgentRunToken,
} from "@shared/community-endpoints.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";

import { isGoogleSearchTool } from "./transforms/createGeminiToolsTransform.ts";

function forcesToolChoice(toolChoice: unknown): boolean {
    if (toolChoice === "required") return true;
    if (!toolChoice || typeof toolChoice !== "object") return false;

    const choice = toolChoice as { mode?: unknown; type?: unknown };
    return !(
        choice.type === "allowed_tools" &&
        (choice.mode === undefined || choice.mode === "auto")
    );
}

function countParts(value: unknown, types: string[]): number {
    if (Array.isArray(value)) {
        return value.reduce(
            (total, item) => total + countParts(item, types),
            0,
        );
    }
    if (!value || typeof value !== "object") return 0;

    const record = value as Record<string, unknown>;
    if (types.includes(record.type as string)) return 1;
    return Object.values(record).reduce<number>(
        (total, item) => total + countParts(item, types),
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

function requestsJsonMode(format: unknown): boolean {
    return (
        !!format &&
        typeof format === "object" &&
        "type" in format &&
        format.type === "json_object"
    );
}

/** Validate declared text capabilities before any provider attempt. */
export function textCapabilityError(
    definition: ModelDefinition | undefined,
    request: Record<string, unknown>,
    communityEndpoint?: CommunityEndpointRuntime,
): string | undefined {
    if (!definition) return;
    if (
        definition.search === false &&
        Array.isArray(request.tools) &&
        request.tools.some(isGoogleSearchTool)
    )
        return "This model does not support web search; choose a model with web_search capability";
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
        definition.supportsJsonMode === false &&
        (requestsJsonMode(request.response_format) ||
            requestsJsonMode(text?.format))
    )
        return "This model does not support JSON mode; use a json_schema response format";
    if (
        definition.maxCompletionTokens !== undefined &&
        requestedCompletionTokens(request) > definition.maxCompletionTokens
    )
        return `This model supports at most ${definition.maxCompletionTokens} output tokens`;
    const referenceImages = countParts(request, ["image_url", "input_image"]);
    // Agents hand images to their own base model or code, which decides.
    const agent = communityEndpoint && usesAgentRunToken(communityEndpoint);
    const textOnly = definition.inputModalities?.includes("image") === false;
    if (!agent && referenceImages > 0 && textOnly)
        return "This model does not support image input";
    // Every model that reads PDFs also reads images, and OpenRouter parses
    // PDFs to text for any model.
    if (
        !agent &&
        textOnly &&
        definition.provider !== "openrouter" &&
        countParts([request.messages, request.input], ["file", "input_file"]) >
            0
    )
        return "This model does not support PDF input";
    if (
        definition.maxReferenceImages !== undefined &&
        referenceImages > definition.maxReferenceImages
    )
        return `This model supports at most ${definition.maxReferenceImages} reference images`;
}

/** Whether a fallback route can honor this text request's public contract. */
export function supportsTextFallbackRequest(
    definition: ModelDefinition | undefined,
    request: Record<string, unknown>,
): boolean {
    return textCapabilityError(definition, request) === undefined;
}
