import type {
    CreateChatCompletionRequest,
    CreateResponseRequest,
    CreateResponseResponse,
    ResponseUsage,
} from "@shared/schemas/openai.ts";
import { functionOutputText } from "@shared/schemas/response-function-items.ts";
import type {
    ChatCompletion,
    ChatMessage,
    CompletionChoice,
} from "../types.js";
import { ResponsesInvalidRequestError } from "./request.js";

type JsonObject = Record<string, unknown>;

type InputItem = JsonObject & {
    type?: unknown;
    role?: unknown;
    content?: unknown;
    output?: unknown;
    id?: unknown;
    status?: unknown;
    call_id?: unknown;
    name?: unknown;
    arguments?: unknown;
};

type ContentPart = JsonObject & {
    type?: unknown;
    text?: unknown;
    image_url?: unknown;
    detail?: unknown;
    refusal?: unknown;
    prompt_cache_breakpoint?: unknown;
    cache_control?: unknown;
};

function invalidRequest(message: string, param: string): never {
    throw new ResponsesInvalidRequestError(message, param);
}

function partText(part: ContentPart, param: string): string {
    if (typeof part.text !== "string") {
        invalidRequest(`${param} must have string text`, param);
    }
    return part.text;
}

function textPart(
    breakpoint: JsonObject | undefined,
    text: string,
): JsonObject {
    return breakpoint
        ? { text, prompt_cache_breakpoint: breakpoint }
        : { text };
}

/** Mirror of `prompt_cache_breakpoint` handling in chatRequest.ts. */
function promptCacheBreakpoint(part: ContentPart): JsonObject | undefined {
    if (part.prompt_cache_breakpoint !== undefined) {
        const breakpoint = part.prompt_cache_breakpoint;
        if (
            !breakpoint ||
            typeof breakpoint !== "object" ||
            Array.isArray(breakpoint) ||
            (breakpoint as JsonObject).mode !== "explicit"
        ) {
            invalidRequest(
                "prompt_cache_breakpoint",
                'prompt_cache_breakpoint must be { "mode": "explicit" }',
            );
        }
        return { mode: "explicit" };
    }
    if (part.cache_control !== undefined) {
        const cacheControl = part.cache_control;
        if (
            !cacheControl ||
            typeof cacheControl !== "object" ||
            Array.isArray(cacheControl) ||
            (cacheControl as JsonObject).type !== "ephemeral"
        ) {
            invalidRequest(
                "cache_control",
                'cache_control must be { "type": "ephemeral" }',
            );
        }
        return { mode: "explicit" };
    }
    return undefined;
}

/**
 * Text and image content parts of one Responses message item.
 * `output` parts come from replayed assistant items.
 */
function contentParts(
    item: InputItem,
    param: string,
    allowImages: boolean,
): JsonObject[] {
    const source = item.content ?? item.output;
    if (typeof source === "string") {
        return [{ type: "text", text: source }];
    }
    if (source == null) return [];
    if (!Array.isArray(source)) {
        invalidRequest(`${param} must be a string or an array`, param);
    }

    const parts: JsonObject[] = [];
    for (const raw of source) {
        if (!raw || typeof raw !== "object") {
            invalidRequest(`${param} parts must be objects`, param);
        }
        const part = raw as ContentPart;
        const breakpoint = promptCacheBreakpoint(part);
        if (part.type === "text" || part.type === "input_text") {
            parts.push({
                type: "text",
                ...textPart(breakpoint, partText(part, param)),
            });
            continue;
        }
        if (part.type === "output_text") {
            parts.push({
                type: "text",
                ...textPart(breakpoint, partText(part, param)),
            });
            continue;
        }
        if (part.type === "refusal") {
            if (typeof part.refusal !== "string") {
                invalidRequest(`${param} refusal must be a string`, param);
            }
            parts.push({ type: "refusal", refusal: part.refusal });
            continue;
        }
        if (part.type === "input_image") {
            if (!allowImages) {
                invalidRequest(
                    `${param} images are only supported in user messages`,
                    param,
                );
            }
            const imageUrl =
                typeof part.image_url === "string"
                    ? part.image_url
                    : part.image_url && typeof part.image_url === "object"
                      ? (part.image_url as JsonObject).url
                      : undefined;
            if (typeof imageUrl !== "string" || !imageUrl) {
                invalidRequest(
                    `${param} image parts require an image_url`,
                    param,
                );
            }
            parts.push({
                type: "image_url",
                image_url: {
                    url: imageUrl,
                    ...(typeof part.detail === "string"
                        ? { detail: part.detail }
                        : {}),
                },
            });
            continue;
        }
        invalidRequest(
            `Unsupported ${param} content part: ${String(part.type ?? "unknown")}`,
            param,
        );
    }
    return parts;
}

type PendingToolCall = {
    callId: string;
    name: string;
    arguments: string;
};

/** Translate Responses input items into Chat messages. */
function inputMessages(request: CreateResponseRequest): ChatMessage[] {
    if (typeof request.input === "string") {
        return [{ role: "user", content: request.input }];
    }

    const messages: ChatMessage[] = [];
    let pendingCalls: PendingToolCall[] | null = null;

    const flushCalls = () => {
        if (!pendingCalls) return;
        messages.push({
            role: "assistant",
            content: null,
            tool_calls: pendingCalls.map((call) => ({
                id: call.callId,
                type: "function",
                function: { name: call.name, arguments: call.arguments },
            })),
        });
        pendingCalls = null;
    };

    for (const raw of request.input) {
        if (!raw || typeof raw !== "object") {
            invalidRequest("input items must be objects", "input");
        }
        const item = raw as InputItem;

        if (item.type === "function_call") {
            if (
                typeof item.call_id !== "string" ||
                typeof item.name !== "string" ||
                typeof item.arguments !== "string"
            ) {
                invalidRequest(
                    "function_call items require call_id, name, and string arguments",
                    "input",
                );
            }
            if ((item.status ?? "completed") !== "completed") {
                invalidRequest(
                    "Only completed function calls can be replayed",
                    "input",
                );
            }
            if (!pendingCalls) pendingCalls = [];
            pendingCalls.push({
                callId: item.call_id,
                name: item.name,
                arguments: item.arguments,
            });
            continue;
        }

        if (item.type === "function_call_output") {
            if (typeof item.call_id !== "string") {
                invalidRequest(
                    "function_call_output items require call_id",
                    "input",
                );
            }
            if ((item.status ?? "completed") !== "completed") {
                invalidRequest(
                    "Only completed function outputs can be replayed",
                    "input",
                );
            }
            flushCalls();
            messages.push({
                role: "tool",
                tool_call_id: item.call_id,
                content: functionOutputText(item.output as never),
            });
            continue;
        }

        if (item.type === "reasoning") {
            // Stateless Chat models cannot reuse provider reasoning state; the
            // model re-reasons from the surrounding messages.
            continue;
        }

        const role = item.role;
        if (typeof role !== "string") {
            invalidRequest(
                "input items must be messages, function calls, or function outputs",
                "input",
            );
        }

        if (role === "system" || role === "developer") {
            flushCalls();
            const parts = contentParts(item, "input.content", false);
            messages.push({
                role: role === "developer" ? "developer" : "system",
                content: parts.map((part) => String(part.text ?? "")).join(""),
            });
            continue;
        }

        if (role === "user") {
            flushCalls();
            const parts = contentParts(item, "input.content", true);
            messages.push({
                role: "user",
                content:
                    parts.length === 1 && "text" in parts[0]
                        ? String(parts[0].text)
                        : parts,
            });
            continue;
        }

        if (role === "assistant") {
            flushCalls();
            const parts = contentParts(item, "input.content", false);
            const text = parts
                .filter((part) => "text" in part)
                .map((part) => part.text)
                .join("");
            const refusal = parts
                .filter((part) => part.type === "refusal")
                .map((part) => part.refusal)
                .join("");
            messages.push({
                role: "assistant",
                content: text || null,
                ...(refusal ? { refusal } : {}),
            });
            continue;
        }

        invalidRequest(`Unsupported input message role: ${role}`, "input.role");
    }
    flushCalls();

    if (!messages.length) {
        invalidRequest("At least one input message is required", "input");
    }
    return messages;
}

function chatTools(request: CreateResponseRequest): unknown[] | undefined {
    if (!request.tools?.length) return undefined;
    return request.tools.map((raw) => {
        const tool = raw as JsonObject;
        if (tool.type !== "function" || typeof tool.name !== "string") {
            invalidRequest("tools", "Only function tools are supported");
        }
        return {
            type: "function",
            function: {
                name: tool.name,
                ...(typeof tool.description === "string"
                    ? { description: tool.description }
                    : {}),
                ...(tool.parameters === undefined
                    ? {}
                    : { parameters: tool.parameters }),
                ...(tool.strict === true ? { strict: true } : {}),
            },
        };
    });
}

function chatToolChoice(value: unknown): unknown {
    if (!value || typeof value !== "object") return value;
    const choice = value as JsonObject;
    if (choice.type !== "function" || typeof choice.name !== "string") {
        invalidRequest(
            "tool_choice",
            "Only function tool choices are supported",
        );
    }
    return { type: "function", function: { name: choice.name } };
}

function chatResponseFormat(
    value: unknown,
): CreateChatCompletionRequest["response_format"] {
    if (!value || typeof value !== "object") return undefined;
    const format = value as JsonObject;
    if (format.type === "text") return { type: "text" };
    if (format.type === "json_object") return { type: "json_object" };
    if (format.type !== "json_schema") {
        invalidRequest("text.format", "Unsupported response format type");
    }
    if (typeof format.schema !== "object") {
        invalidRequest("text.format", "JSON schema format requires a schema");
    }
    return {
        type: "json_schema",
        json_schema: {
            name: typeof format.name === "string" ? format.name : "response",
            ...(typeof format.description === "string"
                ? { description: format.description }
                : {}),
            schema: format.schema,
            ...(format.strict === true ? { strict: true } : {}),
        },
    } as unknown as CreateChatCompletionRequest["response_format"];
}

function rejectUnsupported(request: CreateResponseRequest): void {
    if (request.max_tool_calls != null) {
        invalidRequest(
            "max_tool_calls",
            "max_tool_calls is not supported by this model's Chat adapter",
        );
    }
    if (request.truncation === "auto") {
        invalidRequest(
            "truncation",
            "Automatic truncation is not supported by this model's Chat adapter",
        );
    }
    if (Array.isArray(request.include) && request.include.length > 0) {
        invalidRequest(
            "include",
            "include is not supported by this model's Chat adapter",
        );
    }
    if (request.top_logprobs != null) {
        invalidRequest(
            "top_logprobs",
            "Log probabilities are not supported by this model's Chat adapter",
        );
    }
    if (request.stream_options?.include_obfuscation === true) {
        invalidRequest(
            "stream_options.include_obfuscation",
            "Stream obfuscation is not supported by this model's Chat adapter",
        );
    }
}

/**
 * Translate a stateless Responses request into a Chat Completions request.
 *
 * The converse of `chatToResponsesRequest`: everything Chat can honor is
 * mapped, and the rest fails closed with `unsupported_parameter`.
 */
export function responsesToChatRequest(
    request: CreateResponseRequest,
): CreateChatCompletionRequest {
    rejectUnsupported(request);

    const messages: ChatMessage[] = [];
    if (typeof request.instructions === "string" && request.instructions) {
        messages.push({ role: "system", content: request.instructions });
    }
    messages.push(...inputMessages(request));

    const chatRequest: Record<string, unknown> = {
        model: request.model,
        messages:
            messages as unknown as CreateChatCompletionRequest["messages"],
        ...(request.stream !== undefined ? { stream: request.stream } : {}),
    };

    const tools = chatTools(request);
    if (tools) {
        chatRequest.tools =
            tools as unknown as CreateChatCompletionRequest["tools"];
    }
    if (request.tool_choice !== undefined) {
        chatRequest.tool_choice = chatToolChoice(
            request.tool_choice,
        ) as CreateChatCompletionRequest["tool_choice"];
    }
    if (typeof request.parallel_tool_calls === "boolean") {
        chatRequest.parallel_tool_calls = request.parallel_tool_calls;
    }
    const format = chatResponseFormat(request.text?.format);
    if (format) chatRequest.response_format = format;

    if (request.max_output_tokens != null) {
        chatRequest.max_completion_tokens = request.max_output_tokens;
    }
    if (request.temperature != null) {
        chatRequest.temperature = request.temperature;
    }
    if (request.top_p != null) chatRequest.top_p = request.top_p;
    if (request.frequency_penalty != null) {
        chatRequest.frequency_penalty = request.frequency_penalty;
    }
    if (request.presence_penalty != null) {
        chatRequest.presence_penalty = request.presence_penalty;
    }

    const effort = request.reasoning?.effort;
    if (typeof effort === "string") {
        chatRequest.reasoning_effort =
            effort as CreateChatCompletionRequest["reasoning_effort"];
    }

    const user = request.safety_identifier ?? request.user;
    if (typeof user === "string") chatRequest.user = user;
    if (request.metadata != null) chatRequest.metadata = request.metadata;
    if (typeof request.service_tier === "string") {
        chatRequest.service_tier = request.service_tier;
    }
    if (typeof request.prompt_cache_key === "string") {
        chatRequest.prompt_cache_key = request.prompt_cache_key;
    }
    if (request.prompt_cache_options != null) {
        chatRequest.prompt_cache_options = request.prompt_cache_options;
    }
    if (typeof request.prompt_cache_retention === "string") {
        chatRequest.prompt_cache_retention = request.prompt_cache_retention;
    }
    return chatRequest as unknown as CreateChatCompletionRequest;
}

/** Inverse of `chatUsage` in chatResponse.ts. */
export function chatUsageToResponseUsage(
    usage: Record<string, unknown>,
): ResponseUsage | null {
    const promptTokens = usage.prompt_tokens;
    const completionTokens = usage.completion_tokens;
    const totalTokens = usage.total_tokens;
    if (
        typeof promptTokens !== "number" ||
        typeof completionTokens !== "number" ||
        typeof totalTokens !== "number"
    ) {
        return null;
    }
    const inputDetails = usage.prompt_tokens_details as JsonObject | undefined;
    const outputDetails = usage.completion_tokens_details as
        | JsonObject
        | undefined;
    return {
        input_tokens: promptTokens,
        ...(inputDetails
            ? {
                  input_tokens_details: {
                      cached_tokens: Number(inputDetails.cached_tokens ?? 0),
                      cache_write_tokens: Number(
                          inputDetails.cache_write_tokens ?? 0,
                      ),
                      ...(typeof inputDetails.cache_creation_input_tokens ===
                      "number"
                          ? {
                                cache_creation_input_tokens:
                                    inputDetails.cache_creation_input_tokens,
                            }
                          : {}),
                      ...(typeof inputDetails.audio_tokens === "number"
                          ? { audio_tokens: inputDetails.audio_tokens }
                          : {}),
                      ...(typeof inputDetails.image_tokens === "number"
                          ? { image_tokens: inputDetails.image_tokens }
                          : {}),
                  },
              }
            : {}),
        output_tokens: completionTokens,
        ...(outputDetails
            ? {
                  output_tokens_details: {
                      ...(typeof outputDetails.reasoning_tokens === "number"
                          ? {
                                reasoning_tokens:
                                    outputDetails.reasoning_tokens,
                            }
                          : {}),
                      ...(typeof outputDetails.audio_tokens === "number"
                          ? { audio_tokens: outputDetails.audio_tokens }
                          : {}),
                  },
              }
            : {}),
        total_tokens: totalTokens,
    };
}

/** Response configuration echoed back, as native Responses endpoints do. */
function responseEcho(request: CreateResponseRequest): JsonObject {
    return {
        previous_response_id: null,
        instructions: request.instructions ?? null,
        tools: request.tools ?? [],
        tool_choice: request.tool_choice ?? "auto",
        truncation: "disabled",
        parallel_tool_calls: request.parallel_tool_calls ?? true,
        text: { format: request.text?.format ?? { type: "text" } },
        top_p: request.top_p ?? 1,
        presence_penalty: request.presence_penalty ?? 0,
        frequency_penalty: request.frequency_penalty ?? 0,
        temperature: request.temperature ?? 1,
        reasoning: request.reasoning
            ? { ...request.reasoning, summary: null }
            : null,
        max_output_tokens: request.max_output_tokens ?? null,
        max_tool_calls: null,
        store: false,
        background: false,
        service_tier: request.service_tier ?? "default",
        metadata: request.metadata ?? {},
        safety_identifier: request.safety_identifier ?? null,
        prompt_cache_key: request.prompt_cache_key ?? null,
    };
}

type TerminalStatus = {
    status: "completed" | "incomplete";
    incompleteDetails: JsonObject | null;
};

function terminalStatus(
    finishReason: string | null | undefined,
): TerminalStatus {
    if (finishReason === "length") {
        return {
            status: "incomplete",
            incompleteDetails: { reason: "max_output_tokens" },
        };
    }
    if (finishReason === "content_filter") {
        return {
            status: "incomplete",
            incompleteDetails: { reason: "content_filter" },
        };
    }
    return { status: "completed", incompleteDetails: null };
}

/** One assistant output item built from a Chat choice. */
function choiceOutputItems(choice: CompletionChoice): JsonObject[] {
    const message = (choice.message ?? {}) as JsonObject;
    const items: JsonObject[] = [];

    const reasoning = message.reasoning_content;
    if (typeof reasoning === "string" && reasoning) {
        items.push({
            type: "reasoning",
            content: [{ type: "reasoning_text", text: reasoning }],
        });
    }

    const content = message.content;
    const refusal = typeof message.refusal === "string" ? message.refusal : "";
    if (typeof content === "string" && content) {
        items.push({
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: content }],
            ...(refusal ? { refusal } : {}),
        });
    } else if (refusal) {
        items.push({
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "refusal", refusal }],
        });
    } else if (
        !Array.isArray(message.tool_calls) ||
        !message.tool_calls.length
    ) {
        items.push({
            type: "message",
            role: "assistant",
            status: "completed",
            content: [],
        });
    }

    if (Array.isArray(message.tool_calls)) {
        for (const raw of message.tool_calls) {
            if (!raw || typeof raw !== "object") continue;
            const call = raw as JsonObject;
            const fn = call.function as JsonObject | undefined;
            if (call.type !== "function" || !fn) continue;
            items.push({
                type: "function_call",
                ...(typeof call.id === "string" ? { id: call.id } : {}),
                call_id: typeof call.id === "string" ? call.id : "",
                name: typeof fn.name === "string" ? fn.name : "",
                arguments:
                    typeof fn.arguments === "string"
                        ? fn.arguments
                        : JSON.stringify(fn.arguments ?? {}),
                status: "completed",
            });
        }
    }
    return items;
}

/**
 * Translate a Chat completion into a stateless Responses response.
 *
 * `model` is the caller-facing model id, like `usageHeaders` in
 * text/handler.ts: the registry id names something the caller can act on.
 */
export function chatCompletionToResponse(
    completion: ChatCompletion,
    request: CreateResponseRequest,
    model: string,
): CreateResponseResponse {
    const choice = completion.choices?.[0];
    const finishReason = choice?.finish_reason ?? null;
    const terminal = terminalStatus(finishReason);
    const usage = completion.usage
        ? chatUsageToResponseUsage(completion.usage)
        : null;

    return {
        id: `resp_${crypto.randomUUID().replaceAll("-", "")}`,
        object: "response",
        created_at: completion.created ?? Math.floor(Date.now() / 1000),
        model,
        status: terminal.status,
        incomplete_details: terminal.incompleteDetails,
        output: (choice
            ? choiceOutputItems(choice)
            : []) as CreateResponseResponse["output"],
        error: null,
        usage,
        ...responseEcho(request),
    };
}
