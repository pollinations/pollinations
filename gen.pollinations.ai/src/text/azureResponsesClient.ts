import { collectUpstreamHeaders, remapUpstreamStatus } from "@shared/error.ts";
import debug from "debug";
import {
    type EventSourceMessage,
    EventSourceParserStream,
} from "eventsource-parser/stream";
import type {
    ChatCompletion,
    ChatMessage,
    ServiceError,
    TransformOptions,
} from "./types.js";
import { cleanNullAndUndefined } from "./utils/objectCleaners.js";

const log = debug("pollinations:azure-responses");
const errorLog = debug("pollinations:error");

const REASONING_EFFORT_VALUES = new Set(["minimal", "low", "medium", "high"]);

// Cap the direct Azure request at the same deadline Portkey applies upstream,
// so a hung connection cannot hold a request open indefinitely.
const AZURE_REQUEST_TIMEOUT_MS = 290_000;

interface ResponsesOutputItem {
    type?: string;
    id?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    role?: string;
    content?: Array<{
        type?: string;
        text?: string;
        annotations?: Array<{ type?: string; url?: string }>;
    }>;
    summary?: Array<{ type?: string; text?: string }>;
}

interface ResponsesUsage {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
}

interface ResponsesData {
    id?: string;
    object?: string;
    created_at?: number;
    model?: string;
    status?: string;
    incomplete_details?: { reason?: string };
    output?: ResponsesOutputItem[];
    usage?: ResponsesUsage;
    error?: {
        code?: string | number;
        message?: string;
        status?: number;
    };
}

interface ResponsesChunk {
    id: string;
    object: "chat.completion.chunk";
    created: number;
    model: string;
    choices: Array<{
        index: number;
        delta: Record<string, unknown>;
        finish_reason: string | null;
    }>;
    usage?: Record<string, unknown>;
}

// =============================================================================
// Request conversion (Chat Completions -> Responses API)
// =============================================================================

function contentToParts(
    content: unknown,
    textType: "input_text" | "output_text",
): Array<Record<string, unknown>> {
    if (typeof content === "string") {
        return content ? [{ type: textType, text: content }] : [];
    }
    if (!Array.isArray(content)) return [];

    const parts: Array<Record<string, unknown>> = [];
    for (const raw of content) {
        if (!raw || typeof raw !== "object") continue;
        const part = raw as Record<string, unknown>;
        if (part.type === "text") {
            parts.push({ type: textType, text: String(part.text ?? "") });
        } else if (part.type === "image_url") {
            const imageUrl =
                typeof part.image_url === "string"
                    ? part.image_url
                    : (part.image_url as { url?: string } | undefined)?.url;
            if (imageUrl)
                parts.push({ type: "input_image", image_url: imageUrl });
        } else if (
            part.type === "input_text" ||
            part.type === "input_image" ||
            part.type === "input_audio"
        ) {
            parts.push(part);
        }
    }
    return parts;
}

function toolCallArguments(argumentsValue: unknown): string {
    if (typeof argumentsValue === "string") return argumentsValue;
    try {
        return JSON.stringify(argumentsValue ?? {});
    } catch {
        return "";
    }
}

function convertTool(tool: unknown): Record<string, unknown> | null {
    if (!tool || typeof tool !== "object") return null;
    const entry = tool as Record<string, unknown>;
    if (entry.type !== "function") return null;
    const fn = (entry.function ?? {}) as Record<string, unknown>;
    const converted: Record<string, unknown> = {
        type: "function",
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters,
    };
    if (fn.strict !== undefined) converted.strict = fn.strict;
    return converted;
}

function convertToolChoice(toolChoice: unknown): unknown {
    if (!toolChoice || typeof toolChoice !== "object") return toolChoice;
    const entry = toolChoice as Record<string, unknown>;
    if (entry.type === "function") {
        const fn = (entry.function ?? {}) as { name?: string };
        return fn.name ? { type: "function", name: fn.name } : "auto";
    }
    return entry;
}

function convertResponseFormat(
    responseFormat: Record<string, unknown>,
): Record<string, unknown> {
    const type = responseFormat.type;
    if (type === "json_object") return { type: "json_object" };
    if (type === "json_schema") {
        const schema = responseFormat.json_schema as
            | { name?: string; schema?: unknown; strict?: boolean }
            | undefined;
        return {
            type: "json_schema",
            name: schema?.name ?? "structured_output",
            schema: schema?.schema ?? responseFormat.schema,
            strict: schema?.strict ?? responseFormat.strict,
        };
    }
    return { type: "text" };
}

function messageToResponsesItems(msg: ChatMessage): Record<string, unknown>[] {
    const role = msg.role;

    if (role === "system" || role === "developer") {
        return [
            {
                role,
                content: contentToParts(msg.content, "input_text"),
            },
        ];
    }

    if (role === "user") {
        return [
            {
                role: "user",
                content: contentToParts(msg.content, "input_text"),
            },
        ];
    }

    if (role === "assistant") {
        const items: Record<string, unknown>[] = [];

        // Feed prior-turn reasoning back so the model keeps its context across
        // tool-call loops (only present for clients that persist it, e.g. via
        // the reasoning_content field we emit on responses).
        if (msg.reasoning_content) {
            items.push({
                type: "reasoning",
                summary: [
                    {
                        type: "summary_text",
                        text: String(msg.reasoning_content),
                    },
                ],
            });
        }

        const parts = contentToParts(msg.content, "output_text");
        if (parts.length) {
            items.push({ role: "assistant", content: parts });
        }

        for (const raw of (msg.tool_calls as
            | Record<string, unknown>[]
            | undefined) ?? []) {
            const fn = (raw.function ?? {}) as Record<string, unknown>;
            items.push({
                type: "function_call",
                call_id: String(raw.id ?? ""),
                name: String(fn.name ?? ""),
                arguments: toolCallArguments(fn.arguments),
            });
        }

        return items;
    }

    if (role === "tool" || role === "function") {
        const callId = msg.tool_call_id ?? msg.name ?? "";
        return [
            {
                type: "function_call_output",
                call_id: String(callId),
                output:
                    typeof msg.content === "string"
                        ? msg.content
                        : JSON.stringify(msg.content ?? ""),
            },
        ];
    }

    return [
        {
            role: "user",
            content: contentToParts(msg.content, "input_text"),
        },
    ];
}

function buildResponsesBody(
    messages: ChatMessage[],
    options: TransformOptions,
): Record<string, unknown> {
    const input = messages.flatMap(messageToResponsesItems);

    const body: Record<string, unknown> = { model: options.model, input };

    const effort = options.reasoning_effort;
    if (effort) {
        const normalizedEffort =
            effort === "xhigh"
                ? "high"
                : effort === "none"
                  ? undefined
                  : effort;
        if (normalizedEffort && REASONING_EFFORT_VALUES.has(normalizedEffort)) {
            body.reasoning = { effort: normalizedEffort };
        }
    }

    if (Array.isArray(options.tools) && options.tools.length) {
        const converted = options.tools
            .map(convertTool)
            .filter((tool) => tool !== null);
        if (converted.length) body.tools = converted;
    }
    if (options.tool_choice !== undefined) {
        body.tool_choice = convertToolChoice(options.tool_choice);
    }

    const maxTokens = options.max_completion_tokens ?? options.max_tokens;
    if (maxTokens !== undefined) body.max_output_tokens = maxTokens;

    for (const key of [
        "temperature",
        "top_p",
        "seed",
        "frequency_penalty",
        "presence_penalty",
    ] as const) {
        if (options[key] !== undefined) body[key] = options[key];
    }
    if (options.stop !== undefined) {
        body.stop =
            typeof options.stop === "string" ? [options.stop] : options.stop;
    }

    if (options.response_format) {
        body.text = { format: convertResponseFormat(options.response_format) };
    }

    if (options.stream) body.stream = true;

    return cleanNullAndUndefined(body) as Record<string, unknown>;
}

// =============================================================================
// Response conversion (Responses API -> Chat Completions)
// =============================================================================

function mapResponsesUsage(usage: ResponsesUsage): Record<string, unknown> {
    const mapped: Record<string, unknown> = {
        prompt_tokens: usage.input_tokens ?? 0,
        completion_tokens: usage.output_tokens ?? 0,
        total_tokens: usage.total_tokens ?? 0,
    };
    if (usage.output_tokens_details?.reasoning_tokens !== undefined) {
        mapped.completion_tokens_details = {
            reasoning_tokens: usage.output_tokens_details.reasoning_tokens,
        };
    }
    return mapped;
}

function parseResponsesResponse(
    data: ResponsesData,
    modelName: string,
): ChatCompletion {
    const outputItems = data.output ?? [];

    const messageTexts: string[] = [];
    const reasoningTexts: string[] = [];
    const toolCalls: Array<Record<string, unknown>> = [];
    const citations: string[] = [];

    for (const item of outputItems) {
        if (item.type === "reasoning") {
            for (const part of item.summary ?? []) {
                if (part.text) reasoningTexts.push(part.text);
            }
            for (const part of item.content ?? []) {
                if (part.text) reasoningTexts.push(part.text);
            }
        } else if (item.type === "message") {
            for (const part of item.content ?? []) {
                if (part.type === "output_text" && part.text) {
                    messageTexts.push(part.text);
                }
                for (const annotation of part.annotations ?? []) {
                    if (annotation.type === "url_citation" && annotation.url) {
                        citations.push(annotation.url);
                    }
                }
            }
        } else if (item.type === "function_call") {
            toolCalls.push({
                id: item.call_id || item.id,
                type: "function",
                function: {
                    name: item.name,
                    arguments: item.arguments ?? "",
                },
            });
        }
    }

    const message: ChatMessage = {
        role: "assistant",
        content: messageTexts.join(""),
    };
    if (toolCalls.length) message.tool_calls = toolCalls;
    if (reasoningTexts.length) {
        message.reasoning_content = reasoningTexts.join("\n");
    }

    let finish_reason: string | null = "stop";
    if (toolCalls.length) {
        finish_reason = "tool_calls";
    } else if (
        data.status === "incomplete" &&
        data.incomplete_details?.reason === "max_output_tokens"
    ) {
        finish_reason = "length";
    }

    const completion: ChatCompletion = {
        id: data.id,
        object: "chat.completion",
        created: data.created_at ?? Math.floor(Date.now() / 1000),
        model: data.model || modelName,
        choices: [
            {
                index: 0,
                message,
                finish_reason,
            },
        ],
    };
    if (data.usage) completion.usage = mapResponsesUsage(data.usage);
    if (citations.length) completion.citations = citations;
    return completion;
}

// =============================================================================
// Streaming conversion (Responses API SSE -> Chat Completions SSE)
// =============================================================================

function streamChunk(
    id: string,
    created: number,
    model: string,
    delta: Record<string, unknown>,
    finish_reason: string | null,
    usage?: Record<string, unknown>,
): string {
    const chunk: ResponsesChunk = {
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta, finish_reason }],
    };
    if (usage) chunk.usage = usage;
    return `data: ${JSON.stringify(chunk)}\n\n`;
}

function streamError(message: string): string {
    return `data: ${JSON.stringify({ error: { message } })}\n\n`;
}

function convertResponsesStream(
    source: ReadableStream<Uint8Array<ArrayBuffer>> | null,
    { modelName, includeUsage }: { modelName: string; includeUsage: boolean },
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let chunkId = "chatcmpl-azure-responses";
    let created = Math.floor(Date.now() / 1000);
    const toolIndexByItemId = new Map<string, number>();
    let nextToolIndex = 0;
    let closed = false;

    if (!source) {
        return new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
            },
        });
    }

    function emit(controller: TransformStreamDefaultController, event: string) {
        controller.enqueue(encoder.encode(event));
    }

    function finishReasonFromResponse(
        output: ResponsesOutputItem[] | undefined,
        incompleteDetails: { reason?: string } | undefined,
    ): string | null {
        if (output?.some((item) => item.type === "function_call")) {
            return "tool_calls";
        }
        if (incompleteDetails?.reason === "max_output_tokens") return "length";
        return "stop";
    }

    function handleEvent(
        event: EventSourceMessage,
        controller: TransformStreamDefaultController,
    ) {
        if (event.data === "[DONE]") {
            // A bare [DONE] before a terminal event means the stream
            // was cut off; surface an error instead of a clean stop.
            if (!closed) {
                emit(
                    controller,
                    streamError(
                        "Stream ended unexpectedly before completion.",
                    ) + "data: [DONE]\n\n",
                );
                closed = true;
            }
            return;
        }

        let payload: Record<string, unknown>;
        try {
            payload = JSON.parse(event.data) as Record<string, unknown>;
        } catch {
            return;
        }

        const type = payload.type;

        if (type === "response.created") {
            const response = (payload.response ?? {}) as {
                id?: string;
                created_at?: number;
            };
            if (response.id) chunkId = response.id;
            if (typeof response.created_at === "number") {
                created = response.created_at;
            }
            return;
        }

        if (type === "response.output_item.added") {
            const item = (payload.item ?? {}) as {
                type?: string;
                id?: string;
                call_id?: string;
                name?: string;
            };
            if (item.type === "function_call") {
                const toolIndex = nextToolIndex;
                nextToolIndex += 1;
                const toolKey =
                    item.call_id || item.id || `synthetic-${toolIndex}`;
                // Args delta events reference the item by both its `id` and
                // `call_id`; index by whichever the upstream provides.
                toolIndexByItemId.set(item.id || toolKey, toolIndex);
                toolIndexByItemId.set(item.call_id || toolKey, toolIndex);
                emit(
                    controller,
                    streamChunk(
                        chunkId,
                        created,
                        modelName,
                        {
                            tool_calls: [
                                {
                                    index: toolIndex,
                                    id: toolKey,
                                    type: "function",
                                    function: {
                                        name: item.name,
                                        arguments: "",
                                    },
                                },
                            ],
                        },
                        null,
                    ),
                );
            }
            return;
        }

        if (type === "response.output_text.delta") {
            const delta = payload.delta;
            if (typeof delta === "string") {
                emit(
                    controller,
                    streamChunk(
                        chunkId,
                        created,
                        modelName,
                        { content: delta },
                        null,
                    ),
                );
            }
            return;
        }

        if (type === "response.function_call_arguments.delta") {
            const delta = payload.delta;
            const toolKey =
                (payload.item_id as string | undefined) ??
                (payload.call_id as string | undefined) ??
                "";
            const toolIndex = toolIndexByItemId.get(toolKey) ?? 0;
            if (typeof delta === "string") {
                emit(
                    controller,
                    streamChunk(
                        chunkId,
                        created,
                        modelName,
                        {
                            tool_calls: [
                                {
                                    index: toolIndex,
                                    function: { arguments: delta },
                                },
                            ],
                        },
                        null,
                    ),
                );
            }
            return;
        }

        if (type === "response.completed") {
            if (closed) return;
            const response = (payload.response ?? {}) as {
                output?: ResponsesOutputItem[];
                incomplete_details?: { reason?: string };
                usage?: ResponsesUsage;
            };
            const finishReason = finishReasonFromResponse(
                response.output,
                response.incomplete_details,
            );
            let events = streamChunk(
                chunkId,
                created,
                modelName,
                {},
                finishReason,
            );
            if (includeUsage && response.usage) {
                events += streamChunk(
                    chunkId,
                    created,
                    modelName,
                    {},
                    null,
                    mapResponsesUsage(response.usage),
                );
            }
            events += "data: [DONE]\n\n";
            emit(controller, events);
            closed = true;
            return;
        }

        if (type === "response.failed") {
            if (closed) return;
            const response = (payload.response ?? {}) as {
                error?: { message?: string };
            };
            emit(
                controller,
                streamError(
                    response.error?.message ?? "The model request failed.",
                ) + "data: [DONE]\n\n",
            );
            closed = true;
            return;
        }

        if (type === "error") {
            if (closed) return;
            const error = (payload.error ?? {}) as { message?: string };
            emit(
                controller,
                streamError(error.message ?? "Unknown streaming error") +
                    "data: [DONE]\n\n",
            );
            closed = true;
        }
    }

    return source
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .pipeThrough(
            new TransformStream<EventSourceMessage, Uint8Array>({
                transform(event, controller) {
                    handleEvent(event, controller);
                },
                flush(controller) {
                    if (!closed) {
                        emit(
                            controller,
                            streamError(
                                "Stream ended unexpectedly before completion.",
                            ) + "data: [DONE]\n\n",
                        );
                    }
                },
            }),
        );
}

// =============================================================================
// Client
// =============================================================================

function toServiceError(thrown: unknown): ServiceError {
    return thrown instanceof Error
        ? (thrown as ServiceError)
        : (new Error(String(thrown), { cause: thrown }) as ServiceError);
}

function withUpstreamContext(thrown: unknown, requestUrl: URL): ServiceError {
    const error = toServiceError(thrown);
    error.requestUrl ??= requestUrl;
    error.status ??= 502;
    return error;
}

function createApiError(
    response: Response,
    details: unknown,
    modelName: string,
    requestUrl: URL,
): ServiceError {
    const message =
        typeof details === "object" &&
        details &&
        "error" in details &&
        typeof (details as { error: { message?: unknown } }).error?.message ===
            "string"
            ? (details as { error: { message: string } }).error.message
            : typeof details === "string"
              ? details
              : null;
    const error = new Error(
        message
            ? `${response.status} ${response.statusText}: ${message}`
            : `${response.status} ${response.statusText}`,
    ) as ServiceError;
    error.status = remapUpstreamStatus(response.status);
    error.upstreamStatus = response.status;
    error.details = details;
    error.model = modelName;
    error.requestUrl = requestUrl;
    error.upstreamHeaders = collectUpstreamHeaders(response.headers);
    return error;
}

function withResponseMetadata(
    completion: ChatCompletion,
    requestUrl: URL,
): ChatCompletion {
    Object.defineProperty(completion, "upstreamRequestUrl", {
        value: requestUrl,
        enumerable: false,
        configurable: true,
        writable: true,
    });
    return completion;
}

/**
 * Generates text through the Azure OpenAI Responses API, translating the
 * standard Chat Completions request/response shapes (and SSE stream) to the
 * Responses API shapes. Required for GPT-5-family models, where
 * `reasoning.effort` is only honored by the Responses API.
 */
export async function callAzureResponses(
    messages: ChatMessage[],
    options: TransformOptions,
): Promise<ChatCompletion> {
    const config = (options.modelConfig ?? {}) as Record<string, unknown>;
    const apiKey =
        (config["azure-api-key"] as string | undefined) ??
        process.env.AZURE_MYCELI_PROD_API_KEY;
    const resourceName = config["azure-resource-name"] as string | undefined;
    const deploymentId = config["azure-deployment-id"] as string | undefined;
    const apiVersion = config["azure-api-version"] as string | undefined;

    if (!apiKey) {
        const error = new Error(
            "AZURE_MYCELI_PROD_API_KEY is not configured",
        ) as ServiceError;
        error.status = 502;
        throw error;
    }
    if (!resourceName || !deploymentId || !apiVersion) {
        const error = new Error(
            `Invalid Azure Responses API config for model ${options.model}`,
        ) as ServiceError;
        error.status = 502;
        throw error;
    }

    const modelName = options.model ?? deploymentId;
    const endpoint = `https://${resourceName}.openai.azure.com/openai/deployments/${deploymentId}/responses?api-version=${encodeURIComponent(apiVersion)}`;
    const requestUrl = new URL(endpoint);
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    const body = buildResponsesBody(messages, options);

    log(`[${requestId}] POST ${endpoint}`, {
        model: modelName,
        stream: options.stream === true,
        optionKeys: Object.keys(options),
    });

    let response: Response;
    try {
        response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": apiKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(AZURE_REQUEST_TIMEOUT_MS),
        });
    } catch (thrown: unknown) {
        throw withUpstreamContext(thrown, requestUrl);
    }

    if (!response.ok) {
        let errorText: string;
        try {
            errorText = await response.text();
        } catch (thrown: unknown) {
            throw withUpstreamContext(thrown, requestUrl);
        }
        let details: unknown = errorText;
        try {
            details = JSON.parse(errorText);
        } catch {
            // keep raw text
        }
        errorLog(`[${requestId}] API error (${response.status}):`, details);
        throw createApiError(response, details, modelName, requestUrl);
    }

    if (options.stream) {
        const streamToReturn = convertResponsesStream(response.body, {
            modelName,
            includeUsage: Boolean(options.stream_options?.include_usage),
        });
        return withResponseMetadata(
            {
                id: `azure-responses-${requestId}`,
                object: "chat.completion.chunk",
                created: Math.floor(startTime / 1000),
                model: modelName,
                stream: true,
                responseStream: streamToReturn,
                choices: [
                    {
                        delta: { content: "" },
                        finish_reason: null,
                        index: 0,
                    },
                ],
            },
            requestUrl,
        );
    }

    let data: ResponsesData;
    try {
        data = (await response.json()) as ResponsesData;
    } catch (thrown: unknown) {
        throw withUpstreamContext(thrown, requestUrl);
    }

    if (data.error) {
        const error = new Error(
            data.error.message || "Text generation failed",
        ) as ServiceError;
        error.status = remapUpstreamStatus(data.error.status ?? 502);
        error.upstreamStatus = data.error.status;
        error.details = data.error;
        error.model = modelName;
        error.requestUrl = requestUrl;
        error.upstreamHeaders = collectUpstreamHeaders(response.headers);
        throw error;
    }

    log(
        `[${requestId}] Completed in ${Date.now() - startTime}ms, model: ${data.model || modelName}`,
    );

    const completion = parseResponsesResponse(data, modelName);
    if (!completion.id) {
        completion.id = `azure-responses-${requestId}`;
    }
    return withResponseMetadata(completion, requestUrl);
}
