import type {
    CreateChatCompletionRequest,
    CreateResponseRequest,
    CreateResponseResponse,
    ResponseUsage,
} from "@shared/schemas/openai.ts";
import type { ChatCompletion, ChatMessage } from "../types.js";
import { isPlainObject } from "../utils/objectCleaners.js";
import { ResponsesInvalidRequestError } from "./request.js";

type JsonObject = Record<string, unknown>;

/**
 * Field inventory for CreateResponseRequest -> Chat Completions translation
 * (plan v2, must-fix 4). Every request field is accounted for:
 * - model: set by the caller (canonical registry id per attempt).
 * - input: translated (items below).
 * - instructions: prepended as a system message.
 * - reasoning: {effort} -> reasoning_effort; other keys ignored (summary is a
 *   native-Responses feature; the chat pipeline owns provider reasoning).
 * - max_output_tokens -> max_completion_tokens (chat schema field).
 * - max_tool_calls: rejected (no chat equivalent).
 * - stream/stream_options: stream -> stream + stream_options.include_usage;
 *   include_obfuscation ignored (no obfuscation upstream of chat).
 * - store/previous_response_id/conversation/background/prompt/context_management:
 *   stateless schema already restricts them to inert values; dropped.
 * - include: ignored (documents extra native payloads; adapted output has the
 *   same default shape as native).
 * - text.format -> response_format (text/json_object/json_schema).
 * - tools: only type "function" (schema-enforced) -> chat tools.
 * - tool_choice: auto/none/required passthrough; {type:"function",name} ->
 *   {type:"function",function:{name}}; other native modes (allowed_tools,
 *   mcp) rejected.
 * - parallel_tool_calls, metadata, user (-> user), safety_identifier (dropped,
 *   chat schema has no equivalent; user carries identity),
 *   prompt_cache_key/prompt_cache_options/prompt_cache_retention: passthrough
 *   (chat schema has the same fields).
 * - service_tier: passthrough (chat schema is passthrough; providers that do
 *   not know it ignore it).
 * - temperature/top_p/frequency_penalty/presence_penalty: passthrough.
 * - top_logprobs: rejected (chat adapter does not surface logprobs).
 * - truncation: ignored (chat upstreams truncate provider-side).
 * - safe: dropped (route middleware already applied safety to the request).
 */

function invalid(message: string, param: string): never {
    throw new ResponsesInvalidRequestError(message, param);
}

function roleFor(role: unknown): string {
    if (typeof role !== "string" || !role) return "user";
    if (role === "developer") return "developer";
    if (role === "system" || role === "user" || role === "assistant") {
        return role;
    }
    invalid(`Unsupported input item role: ${role}`, "input");
}

function chatContentParts(
    content: unknown,
    role: string,
    param: string,
): unknown {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) {
        invalid(`${param} must be a string or content parts`, param);
    }
    const parts: JsonObject[] = [];
    for (const [index, raw] of content.entries()) {
        const partParam = `${param}.${index}`;
        if (!isPlainObject(raw))
            invalid("Content part must be an object", partParam);
        switch (raw.type) {
            case "input_text":
            case "output_text": {
                if (typeof raw.text !== "string") {
                    invalid("Text part requires a string text", partParam);
                }
                parts.push({ type: "text", text: raw.text });
                break;
            }
            case "input_image": {
                if (role !== "user") {
                    invalid(
                        "Images are only supported in user input items",
                        partParam,
                    );
                }
                const imageUrl = raw.image_url;
                if (typeof imageUrl !== "string" || !imageUrl) {
                    invalid(
                        "input_image requires an image_url (URL or data: URL); file_id is not supported by the stateless endpoint",
                        partParam,
                    );
                }
                parts.push({
                    type: "image_url",
                    image_url: {
                        url: imageUrl,
                        ...(typeof raw.detail === "string"
                            ? { detail: raw.detail }
                            : {}),
                    },
                });
                break;
            }
            case "refusal":
            case "input_refusal": {
                parts.push({
                    type: "text",
                    text: typeof raw.refusal === "string" ? raw.refusal : "",
                });
                break;
            }
            case "input_file":
            case "input_audio":
            case "input_video": {
                invalid(
                    `Content part type ${String(raw.type)} is not supported on adapted chat models`,
                    partParam,
                );
                break;
            }
            default: {
                // prompt_cache_breakpoint and provider extensions ride through
                // as passthrough parts; the chat pipeline knows the cache one.
                if (typeof raw.type === "string") {
                    parts.push(raw);
                    break;
                }
                invalid("Content part requires a type", partParam);
            }
        }
    }
    if (parts.length === 1 && parts[0].type === "text") {
        return parts[0].text as string;
    }
    return parts;
}

/**
 * Translate the stateless Responses input into Chat messages.
 *
 * Item handling: message items keep their order; consecutive function_call
 * items merge into one assistant message with several tool_calls; each
 * function_call_output becomes a tool message correlated by call_id.
 * Reasoning items carry opaque provider state and are dropped. Anything else
 * (item_reference is rejected earlier by validateDirectResponsesRequest)
 * fails with a parameter-specific 400 instead of disappearing.
 */
export function responsesInputToChatMessages(
    input: CreateResponseRequest["input"],
    instructions: CreateResponseRequest["instructions"],
): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (typeof instructions === "string" && instructions) {
        messages.push({ role: "system", content: instructions });
    }
    if (typeof input === "string") {
        messages.push({ role: "user", content: input });
        return messages;
    }

    let pendingToolCalls: JsonObject[] = [];
    const flushToolCalls = () => {
        if (pendingToolCalls.length === 0) return;
        messages.push({
            role: "assistant",
            content: null,
            tool_calls: pendingToolCalls,
        } as unknown as ChatMessage);
        pendingToolCalls = [];
    };

    for (const [index, raw] of input.entries()) {
        const param = `input.${index}`;
        if (typeof raw === "string") {
            flushToolCalls();
            messages.push({ role: "user", content: raw });
            continue;
        }
        if (!isPlainObject(raw)) invalid("Input item must be an object", param);
        // Easy-input shorthand: {role, content} without a type is a message.
        const type =
            raw.type ?? (raw.role !== undefined ? "message" : undefined);
        switch (type) {
            case "message": {
                flushToolCalls();
                const role = roleFor(raw.role);
                messages.push({
                    role,
                    content: chatContentParts(
                        raw.content ?? "",
                        role,
                        `${param}.content`,
                    ),
                } as ChatMessage);
                break;
            }
            case "function_call": {
                if (typeof raw.name !== "string" || !raw.name) {
                    invalid("function_call requires a name", param);
                }
                if (typeof raw.call_id !== "string" || !raw.call_id) {
                    invalid("function_call requires a call_id", param);
                }
                pendingToolCalls.push({
                    id: raw.call_id,
                    type: "function",
                    function: {
                        name: raw.name,
                        arguments:
                            typeof raw.arguments === "string"
                                ? raw.arguments
                                : "",
                    },
                });
                break;
            }
            case "function_call_output": {
                flushToolCalls();
                const callId = raw.call_id;
                if (typeof callId !== "string" || !callId) {
                    invalid("function_call_output requires a call_id", param);
                }
                const output = raw.output;
                messages.push({
                    role: "tool",
                    tool_call_id: callId,
                    content:
                        typeof output === "string"
                            ? output
                            : JSON.stringify(output ?? null),
                } as unknown as ChatMessage);
                break;
            }
            case "reasoning": {
                // Opaque provider reasoning state: not replayable upstream.
                break;
            }
            case "item_reference": {
                invalid(
                    "item_reference is not supported by the stateless Responses endpoint",
                    param,
                );
                break;
            }
            default: {
                invalid(
                    `Input item type ${String(type ?? "unknown")} is not supported on adapted chat models`,
                    param,
                );
            }
        }
    }
    flushToolCalls();
    if (messages.length === 0) {
        invalid("At least one input item is required", "input");
    }
    return messages;
}

function chatTools(
    tools: CreateResponseRequest["tools"],
): CreateChatCompletionRequest["tools"] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((tool, index) => {
        if (tool.type !== "function") {
            invalid(
                `Only function tools are supported on adapted chat models, got ${String(tool.type)}`,
                `tools.${index}`,
            );
        }
        return {
            type: "function" as const,
            function: {
                name: tool.name,
                ...(tool.description !== undefined
                    ? { description: tool.description }
                    : {}),
                ...(tool.parameters !== undefined
                    ? { parameters: tool.parameters }
                    : {}),
                ...(tool.strict !== undefined && tool.strict !== null
                    ? { strict: tool.strict }
                    : {}),
            },
        };
    }) as CreateChatCompletionRequest["tools"];
}

function chatToolChoice(
    toolChoice: CreateResponseRequest["tool_choice"],
): CreateChatCompletionRequest["tool_choice"] | undefined {
    if (toolChoice === undefined || toolChoice === null) return undefined;
    if (
        toolChoice === "auto" ||
        toolChoice === "none" ||
        toolChoice === "required"
    ) {
        return toolChoice;
    }
    if (isPlainObject(toolChoice)) {
        if (
            toolChoice.type === "function" &&
            typeof toolChoice.name === "string"
        ) {
            return {
                type: "function",
                function: { name: toolChoice.name },
            } as CreateChatCompletionRequest["tool_choice"];
        }
        invalid(
            `tool_choice type ${String(toolChoice.type)} is not supported on adapted chat models`,
            "tool_choice",
        );
    }
    invalid(
        "tool_choice must be auto, none, required or a function",
        "tool_choice",
    );
}

function chatResponseFormat(
    text: CreateResponseRequest["text"],
): CreateChatCompletionRequest["response_format"] | undefined {
    if (!isPlainObject(text)) return undefined;
    const format = text.format;
    if (!isPlainObject(format)) return undefined;
    switch (format.type) {
        case "text":
            return {
                type: "text",
            } as CreateChatCompletionRequest["response_format"];
        case "json_object":
            return {
                type: "json_object",
            } as CreateChatCompletionRequest["response_format"];
        case "json_schema": {
            // OpenAI Responses: {type:"json_schema", name, schema, strict?, description?}
            if (
                typeof format.name !== "string" ||
                !isPlainObject(format.schema)
            ) {
                invalid(
                    "text.format json_schema requires name and schema",
                    "text.format",
                );
            }
            return {
                type: "json_schema",
                json_schema: {
                    name: format.name,
                    schema: format.schema,
                    ...(typeof format.description === "string"
                        ? { description: format.description }
                        : {}),
                    ...(typeof format.strict === "boolean"
                        ? { strict: format.strict }
                        : {}),
                },
            } as CreateChatCompletionRequest["response_format"];
        }
        default:
            invalid(
                `text.format type ${String(format.type)} is not supported`,
                "text.format",
            );
    }
}

/** Responses request -> Chat Completions request for the adapted path. */
export function responsesToChatRequest(
    request: CreateResponseRequest,
    modelId: string,
): CreateChatCompletionRequest {
    if (request.max_tool_calls != null) {
        invalid(
            "max_tool_calls is not supported on adapted chat models",
            "max_tool_calls",
        );
    }
    if (request.top_logprobs != null) {
        invalid(
            "top_logprobs is not supported on adapted chat models",
            "top_logprobs",
        );
    }

    const chat: JsonObject = {
        model: modelId,
        messages: responsesInputToChatMessages(
            request.input,
            request.instructions,
        ),
    };
    const tools = chatTools(request.tools);
    if (tools) chat.tools = tools;
    const toolChoice = chatToolChoice(request.tool_choice);
    if (toolChoice !== undefined) chat.tool_choice = toolChoice;
    const responseFormat = chatResponseFormat(request.text);
    if (responseFormat) chat.response_format = responseFormat;

    if (request.max_output_tokens != null) {
        chat.max_completion_tokens = request.max_output_tokens;
    }
    const effort = isPlainObject(request.reasoning)
        ? request.reasoning.effort
        : undefined;
    if (typeof effort === "string") chat.reasoning_effort = effort;
    if (request.temperature != null) chat.temperature = request.temperature;
    if (request.top_p != null) chat.top_p = request.top_p;
    if (request.frequency_penalty != null) {
        chat.frequency_penalty = request.frequency_penalty;
    }
    if (request.presence_penalty != null) {
        chat.presence_penalty = request.presence_penalty;
    }
    if (request.parallel_tool_calls !== undefined) {
        chat.parallel_tool_calls = request.parallel_tool_calls;
    }
    if (isPlainObject(request.metadata)) chat.metadata = request.metadata;
    if (typeof request.user === "string") chat.user = request.user;
    if (typeof request.prompt_cache_key === "string") {
        chat.prompt_cache_key = request.prompt_cache_key;
    }
    if (request.prompt_cache_options) {
        chat.prompt_cache_options = request.prompt_cache_options;
    }
    if (typeof request.prompt_cache_retention === "string") {
        chat.prompt_cache_retention = request.prompt_cache_retention;
    }
    if (typeof request.service_tier === "string") {
        chat.service_tier = request.service_tier;
    }
    if (request.stream) {
        chat.stream = true;
        chat.stream_options = { include_usage: true };
    }
    return chat as unknown as CreateChatCompletionRequest;
}

// ---------------------------------------------------------------------------
// Chat completion -> Responses response
// ---------------------------------------------------------------------------

function usageToResponseUsage(
    usage: ChatCompletion["usage"],
): ResponseUsage | null {
    if (!isPlainObject(usage)) return null;
    const input = usage.prompt_tokens;
    const output = usage.completion_tokens;
    const total = usage.total_tokens;
    if (
        typeof input !== "number" ||
        typeof output !== "number" ||
        typeof total !== "number"
    ) {
        return null;
    }
    const promptDetails = isPlainObject(usage.prompt_tokens_details)
        ? usage.prompt_tokens_details
        : {};
    const completionDetails = isPlainObject(usage.completion_tokens_details)
        ? usage.completion_tokens_details
        : {};
    return {
        input_tokens: input,
        input_tokens_details: {
            ...(typeof promptDetails.cached_tokens === "number"
                ? { cached_tokens: promptDetails.cached_tokens }
                : {}),
        },
        output_tokens: output,
        output_tokens_details: {
            ...(typeof completionDetails.reasoning_tokens === "number"
                ? { reasoning_tokens: completionDetails.reasoning_tokens }
                : {}),
        },
        total_tokens: total,
    };
}

function reasoningText(message: JsonObject): string | undefined {
    for (const key of ["reasoning_content", "reasoning"]) {
        const value = message[key];
        if (typeof value === "string" && value) return value;
    }
    return undefined;
}

type AdaptedStatus = {
    status: "completed" | "incomplete" | "failed";
    incomplete_details?: { reason: string } | null;
    error?: JsonObject | null;
};

function statusFor(finishReason: unknown): AdaptedStatus {
    switch (finishReason) {
        case "length":
        case "max_tokens":
            return {
                status: "incomplete",
                incomplete_details: { reason: "max_output_tokens" },
            };
        case "content_filter":
            return {
                status: "incomplete",
                incomplete_details: { reason: "content_filter" },
            };
        case "stop":
        case "tool_calls":
        case "function_call":
        case null:
        case undefined:
            return { status: "completed", incomplete_details: null };
        default:
            return {
                status: "failed",
                error: {
                    code: "server_error",
                    message: `Unsupported finish reason: ${String(finishReason)}`,
                },
            };
    }
}

function messageOutputItems(message: JsonObject): JsonObject[] {
    const items: JsonObject[] = [];
    const reasoning = reasoningText(message);
    if (reasoning) {
        items.push({
            id: `rs_${crypto.randomUUID().replaceAll("-", "")}`,
            type: "reasoning",
            summary: [{ type: "summary_text", text: reasoning }],
        });
    }
    const toolCalls = Array.isArray(message.tool_calls)
        ? message.tool_calls
        : [];
    for (const call of toolCalls) {
        if (!isPlainObject(call)) continue;
        const fn = isPlainObject(call.function) ? call.function : {};
        items.push({
            id: `fc_${crypto.randomUUID().replaceAll("-", "")}`,
            type: "function_call",
            call_id: typeof call.id === "string" ? call.id : "",
            name: typeof fn.name === "string" ? fn.name : "",
            arguments: typeof fn.arguments === "string" ? fn.arguments : "",
            status: "completed",
        });
    }
    const content = message.content;
    const text = typeof content === "string" ? content : "";
    const refusal =
        typeof message.refusal === "string" && message.refusal
            ? message.refusal
            : undefined;
    if (text || refusal || toolCalls.length === 0) {
        const parts: JsonObject[] = [];
        if (text) {
            parts.push({
                type: "output_text",
                text,
                annotations: [],
            });
        }
        if (refusal) parts.push({ type: "refusal", refusal });
        if (parts.length === 0) {
            parts.push({ type: "output_text", text: "", annotations: [] });
        }
        items.push({
            id: `msg_${crypto.randomUUID().replaceAll("-", "")}`,
            type: "message",
            status: "completed",
            role: "assistant",
            content: parts,
        });
    }
    return items;
}

/**
 * Assemble the public Responses envelope from a chat completion. The caller
 * fails the request when usage is missing (billing guarantee), so a completed
 * or incomplete response here always carries usage.
 */
export function chatCompletionToResponse(
    completion: ChatCompletion,
    modelId: string,
): CreateResponseResponse {
    const choice = Array.isArray(completion.choices)
        ? completion.choices[0]
        : undefined;
    const message = isPlainObject(choice?.message)
        ? (choice.message as JsonObject)
        : {};
    const { status, incomplete_details, error } = statusFor(
        choice?.finish_reason,
    );
    const usage = usageToResponseUsage(completion.usage);
    return {
        id:
            typeof completion.id === "string" && completion.id
                ? completion.id
                : `resp_${crypto.randomUUID().replaceAll("-", "")}`,
        object: "response",
        created_at:
            typeof completion.created === "number"
                ? completion.created
                : Math.floor(Date.now() / 1000),
        model: modelId,
        status,
        output: messageOutputItems(message),
        usage,
        ...(incomplete_details !== undefined ? { incomplete_details } : {}),
        ...(error !== undefined ? { error } : {}),
    } as unknown as CreateResponseResponse;
}

export { usageToResponseUsage };
