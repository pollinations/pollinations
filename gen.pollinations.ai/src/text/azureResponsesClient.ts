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

const log = debug("pollinations:azure-responses");
const errorLog = debug("pollinations:error");
const REQUEST_TIMEOUT_MS = 290_000;
const REASONING_EFFORTS = new Set([
    "none",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
]);

type Json = Record<string, unknown>;

interface ResponseItem {
    type?: string;
    id?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
    summary?: Array<{ text?: string }>;
}

interface ResponsesUsage {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: {
        cached_tokens?: number;
        cache_write_tokens?: number;
    };
    output_tokens_details?: { reasoning_tokens?: number };
}

interface ResponsesData {
    id?: string;
    created_at?: number;
    model?: string;
    status?: string;
    incomplete_details?: { reason?: string };
    output?: ResponseItem[];
    usage?: ResponsesUsage;
    error?: { message?: string; status?: number };
}

function contentParts(
    content: unknown,
    textType: "input_text" | "output_text",
): Json[] {
    if (typeof content === "string") {
        return content ? [{ type: textType, text: content }] : [];
    }
    if (!Array.isArray(content)) return [];

    const result: Json[] = [];
    for (const raw of content) {
        if (!raw || typeof raw !== "object") continue;
        const part = raw as Json;
        if (part.type === "text") {
            result.push({ type: textType, text: String(part.text ?? "") });
            continue;
        }
        if (textType !== "input_text") continue;
        if (part.type === "input_text" || part.type === "input_image") {
            result.push(part);
            continue;
        }
        if (part.type !== "image_url") continue;

        const image = part.image_url as
            | string
            | { url?: string; detail?: string }
            | undefined;
        const imageUrl = typeof image === "string" ? image : image?.url;
        if (!imageUrl) continue;
        result.push({
            type: "input_image",
            image_url: imageUrl,
            ...(typeof image === "object" && image.detail
                ? { detail: image.detail }
                : {}),
        });
    }
    return result;
}

function stringifyArguments(value: unknown): string {
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value ?? {});
    } catch {
        return "";
    }
}

function toolOutput(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        const text = content.flatMap((raw) => {
            if (!raw || typeof raw !== "object") return [];
            const part = raw as Json;
            return part.type === "text" && typeof part.text === "string"
                ? [part.text]
                : [];
        });
        if (text.length) return text.join("");
    }
    try {
        return JSON.stringify(content ?? "");
    } catch {
        return "";
    }
}

function messageItems(message: ChatMessage): Json[] {
    if (["system", "developer", "user"].includes(message.role)) {
        return [
            {
                role: message.role,
                content: contentParts(message.content, "input_text"),
            },
        ];
    }
    if (message.role === "assistant") {
        const items: Json[] = [];
        const content = contentParts(message.content, "output_text");
        if (content.length) items.push({ role: "assistant", content });
        for (const raw of message.tool_calls ?? []) {
            if (!raw || typeof raw !== "object") continue;
            const toolCall = raw as Json;
            const fn = (toolCall.function ?? {}) as Json;
            items.push({
                type: "function_call",
                call_id: String(toolCall.id ?? ""),
                name: String(fn.name ?? ""),
                arguments: stringifyArguments(fn.arguments),
            });
        }
        return items;
    }
    if (message.role === "tool" || message.role === "function") {
        return [
            {
                type: "function_call_output",
                call_id: String(message.tool_call_id ?? message.name ?? ""),
                output: toolOutput(message.content),
            },
        ];
    }
    return [];
}

function responseFormat(format: Json): Json {
    if (format.type === "json_object") return { type: "json_object" };
    if (format.type !== "json_schema") return { type: "text" };
    const schema = (format.json_schema ?? {}) as Json;
    return {
        type: "json_schema",
        name: schema.name ?? "structured_output",
        schema: schema.schema ?? format.schema,
        strict: schema.strict ?? format.strict,
    };
}

function buildBody(messages: ChatMessage[], options: TransformOptions): Json {
    const body: Json = {
        model: options.model,
        input: messages.flatMap(messageItems),
        store: false,
    };
    if (
        typeof options.reasoning_effort === "string" &&
        REASONING_EFFORTS.has(options.reasoning_effort)
    ) {
        body.reasoning = { effort: options.reasoning_effort, summary: "auto" };
    }
    if (Array.isArray(options.tools) && options.tools.length) {
        body.tools = options.tools.flatMap((raw) => {
            if (!raw || typeof raw !== "object") return [];
            const tool = raw as Json;
            if (tool.type !== "function") return [];
            const fn = (tool.function ?? {}) as Json;
            return [
                {
                    type: "function",
                    name: fn.name,
                    description: fn.description,
                    parameters: fn.parameters ?? null,
                    strict: fn.strict ?? false,
                },
            ];
        });
    }
    if (options.tool_choice !== undefined) {
        const choice = options.tool_choice as Json;
        body.tool_choice =
            choice?.type === "function"
                ? {
                      type: "function",
                      name: (choice.function as Json | undefined)?.name,
                  }
                : options.tool_choice;
    }
    if (typeof options.parallel_tool_calls === "boolean") {
        body.parallel_tool_calls = options.parallel_tool_calls;
    }
    const maxTokens = options.max_completion_tokens ?? options.max_tokens;
    if (maxTokens !== undefined) body.max_output_tokens = maxTokens;
    if (options.temperature !== undefined)
        body.temperature = options.temperature;
    if (options.top_p !== undefined) body.top_p = options.top_p;
    if (typeof options.user === "string") {
        body.safety_identifier = options.user;
    }
    if (options.response_format) {
        body.text = { format: responseFormat(options.response_format) };
    }
    if (options.stream) body.stream = true;
    return body;
}

function chatUsage(usage: ResponsesUsage): Json {
    const result: Json = {
        prompt_tokens: usage.input_tokens ?? 0,
        completion_tokens: usage.output_tokens ?? 0,
        total_tokens: usage.total_tokens ?? 0,
    };
    if (usage.input_tokens_details) {
        result.prompt_tokens_details = {
            cached_tokens: usage.input_tokens_details.cached_tokens ?? 0,
            cache_write_tokens:
                usage.input_tokens_details.cache_write_tokens ?? 0,
        };
    }
    if (usage.output_tokens_details) {
        result.completion_tokens_details = {
            reasoning_tokens: usage.output_tokens_details.reasoning_tokens ?? 0,
        };
    }
    return result;
}

function finishReason(data: {
    output?: ResponseItem[];
    incomplete_details?: { reason?: string };
}): string {
    if (data.output?.some((item) => item.type === "function_call")) {
        return "tool_calls";
    }
    if (data.incomplete_details?.reason === "max_output_tokens") {
        return "length";
    }
    if (data.incomplete_details?.reason === "content_filter") {
        return "content_filter";
    }
    return "stop";
}

function parseResponse(data: ResponsesData, requestedModel: string) {
    const texts: string[] = [];
    const refusals: string[] = [];
    const reasoning: string[] = [];
    const toolCalls: Json[] = [];

    for (const item of data.output ?? []) {
        if (item.type === "reasoning") {
            for (const part of [
                ...(item.summary ?? []),
                ...(item.content ?? []),
            ]) {
                if (part.text) reasoning.push(part.text);
            }
        } else if (item.type === "message") {
            for (const part of item.content ?? []) {
                if (part.type === "output_text" && part.text) {
                    texts.push(part.text);
                } else if (part.type === "refusal" && part.refusal) {
                    refusals.push(part.refusal);
                }
            }
        } else if (item.type === "function_call") {
            toolCalls.push({
                id: item.call_id ?? item.id ?? "",
                type: "function",
                function: {
                    name: item.name ?? "",
                    arguments: item.arguments ?? "",
                },
            });
        }
    }

    const message: ChatMessage = {
        role: "assistant",
        content: texts.length ? texts.join("") : null,
        refusal: refusals.length ? refusals.join("") : null,
    };
    if (toolCalls.length) message.tool_calls = toolCalls;
    if (reasoning.length) message.reasoning_content = reasoning.join("\n");

    const completion: ChatCompletion = {
        id: data.id,
        object: "chat.completion",
        created: data.created_at ?? Math.floor(Date.now() / 1000),
        model: data.model ?? requestedModel,
        choices: [
            {
                index: 0,
                message,
                finish_reason: finishReason(data),
            },
        ],
    };
    if (data.usage) completion.usage = chatUsage(data.usage);
    return completion;
}

function dataEvent(value: unknown) {
    return `data: ${typeof value === "string" ? value : JSON.stringify(value)}\n\n`;
}

function terminalError(message: string) {
    return `${dataEvent({ error: { message } })}${dataEvent("[DONE]")}`;
}

function convertStream(
    source: ReadableStream<Uint8Array<ArrayBuffer>> | null,
    model: string,
    includeUsage: boolean,
) {
    const encoder = new TextEncoder();
    let id = "chatcmpl-azure-responses";
    let created = Math.floor(Date.now() / 1000);
    let terminal = false;
    let nextToolIndex = 0;
    const toolIndexes = new Map<string, number>();

    if (!source) {
        return new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    encoder.encode(
                        terminalError("The upstream response had no body."),
                    ),
                );
                controller.close();
            },
        });
    }

    const chatChunk = (delta: Json, finish_reason: string | null = null) =>
        dataEvent({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta, finish_reason }],
            ...(includeUsage ? { usage: null } : {}),
        });
    const usageChunk = (usage: ResponsesUsage) =>
        dataEvent({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [],
            usage: chatUsage(usage),
        });

    return source
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .pipeThrough(
            new TransformStream<EventSourceMessage, Uint8Array>({
                transform(event, controller) {
                    const emit = (value: string) =>
                        controller.enqueue(encoder.encode(value));
                    if (event.data === "[DONE]") {
                        if (!terminal) {
                            emit(
                                terminalError(
                                    "Stream ended unexpectedly before completion.",
                                ),
                            );
                            terminal = true;
                        }
                        return;
                    }

                    let payload: Json;
                    try {
                        payload = JSON.parse(event.data) as Json;
                    } catch {
                        return;
                    }
                    const type = payload.type;

                    if (type === "response.created") {
                        const response = (payload.response ??
                            {}) as ResponsesData;
                        id = response.id ?? id;
                        created = response.created_at ?? created;
                        emit(chatChunk({ role: "assistant", content: "" }));
                        return;
                    }
                    if (type === "response.output_item.added") {
                        const item = (payload.item ?? {}) as ResponseItem;
                        if (item.type !== "function_call") return;
                        const index = nextToolIndex++;
                        const key = item.call_id ?? item.id ?? String(index);
                        if (item.id) toolIndexes.set(item.id, index);
                        if (item.call_id) toolIndexes.set(item.call_id, index);
                        emit(
                            chatChunk({
                                tool_calls: [
                                    {
                                        index,
                                        id: key,
                                        type: "function",
                                        function: {
                                            name: item.name ?? "",
                                            arguments: "",
                                        },
                                    },
                                ],
                            }),
                        );
                        return;
                    }
                    if (type === "response.output_text.delta") {
                        if (typeof payload.delta === "string") {
                            emit(chatChunk({ content: payload.delta }));
                        }
                        return;
                    }
                    if (type === "response.refusal.delta") {
                        if (typeof payload.delta === "string") {
                            emit(chatChunk({ refusal: payload.delta }));
                        }
                        return;
                    }
                    if (
                        type === "response.reasoning_text.delta" ||
                        type === "response.reasoning_summary_text.delta"
                    ) {
                        if (typeof payload.delta === "string") {
                            emit(
                                chatChunk({ reasoning_content: payload.delta }),
                            );
                        }
                        return;
                    }
                    if (type === "response.function_call_arguments.delta") {
                        if (typeof payload.delta !== "string") return;
                        const key = String(
                            payload.item_id ?? payload.call_id ?? "",
                        );
                        const index = toolIndexes.get(key);
                        if (index === undefined) return;
                        emit(
                            chatChunk({
                                tool_calls: [
                                    {
                                        index,
                                        function: { arguments: payload.delta },
                                    },
                                ],
                            }),
                        );
                        return;
                    }
                    if (
                        type === "response.completed" ||
                        type === "response.incomplete"
                    ) {
                        if (terminal) return;
                        const response = (payload.response ??
                            {}) as ResponsesData;
                        emit(chatChunk({}, finishReason(response)));
                        if (includeUsage && response.usage) {
                            emit(usageChunk(response.usage));
                        }
                        emit(dataEvent("[DONE]"));
                        terminal = true;
                        return;
                    }
                    if (type === "response.failed" || type === "error") {
                        if (terminal) return;
                        const response = (payload.response ??
                            payload) as ResponsesData;
                        emit(
                            terminalError(
                                response.error?.message ??
                                    "The model request failed.",
                            ),
                        );
                        terminal = true;
                    }
                },
                flush(controller) {
                    if (!terminal) {
                        controller.enqueue(
                            encoder.encode(
                                terminalError(
                                    "Stream ended unexpectedly before completion.",
                                ),
                            ),
                        );
                    }
                },
            }),
        );
}

function withRequestUrl(completion: ChatCompletion, requestUrl: URL) {
    Object.defineProperty(completion, "upstreamRequestUrl", {
        value: requestUrl,
        enumerable: false,
        configurable: true,
        writable: true,
    });
    return completion;
}

function serviceError(
    message: string,
    requestUrl?: URL,
    status = 502,
    details?: unknown,
): ServiceError {
    const error = new Error(message) as ServiceError;
    error.status = status;
    error.requestUrl = requestUrl;
    error.details = details;
    return error;
}

export async function callAzureResponses(
    messages: ChatMessage[],
    options: TransformOptions,
): Promise<ChatCompletion> {
    const config = (options.modelConfig ?? {}) as Json;
    const apiKey = config["azure-api-key"] as string | undefined;
    const resource = config["azure-resource-name"] as string | undefined;
    const deployment = config["azure-deployment-id"] as string | undefined;
    if (!apiKey) {
        throw serviceError("Azure Responses API key is not configured");
    }
    if (!resource || !deployment) {
        throw serviceError(
            `Invalid Azure Responses API config for model ${options.model}`,
        );
    }

    const model = options.model ?? deployment;
    const requestUrl = new URL(
        `https://${resource}.openai.azure.com/openai/v1/responses`,
    );
    if (options.reasoning_effort === "minimal") {
        throw serviceError(
            'reasoning_effort "minimal" is not supported by GPT-5.6',
            requestUrl,
            400,
        );
    }
    if (options.stop !== undefined && options.stop !== null) {
        throw serviceError(
            "stop is not supported by the Azure Responses API",
            requestUrl,
            400,
        );
    }
    if (options.logit_bias !== undefined && options.logit_bias !== null) {
        throw serviceError(
            "logit_bias is not supported by the Azure Responses API",
            requestUrl,
            400,
        );
    }
    if (options.logprobs === true || options.top_logprobs != null) {
        throw serviceError(
            "logprobs are not supported by GPT-5.6",
            requestUrl,
            400,
        );
    }
    const requestId = crypto.randomUUID();
    const started = Date.now();

    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        response = await fetch(requestUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "api-key": apiKey },
            body: JSON.stringify(buildBody(messages, options)),
            signal: controller.signal,
        });
    } catch (thrown) {
        const error =
            thrown instanceof Error
                ? (thrown as ServiceError)
                : serviceError(String(thrown));
        error.status ??= 502;
        error.requestUrl ??= requestUrl;
        throw error;
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        const text = await response.text();
        let details: unknown = text;
        try {
            details = JSON.parse(text);
        } catch {
            // Keep the raw upstream error.
        }
        const message =
            typeof details === "object" &&
            details &&
            typeof (details as { error?: { message?: unknown } }).error
                ?.message === "string"
                ? (details as { error: { message: string } }).error.message
                : `${response.status} ${response.statusText}`;
        errorLog(`[${requestId}] Azure Responses error`, details);
        const error = serviceError(
            `${response.status} ${response.statusText}: ${message}`,
            requestUrl,
            remapUpstreamStatus(response.status),
            details,
        );
        error.upstreamStatus = response.status;
        error.upstreamHeaders = collectUpstreamHeaders(response.headers);
        throw error;
    }

    if (options.stream) {
        return withRequestUrl(
            {
                id: `azure-responses-${requestId}`,
                object: "chat.completion.chunk",
                created: Math.floor(started / 1000),
                model,
                stream: true,
                responseStream: convertStream(
                    response.body,
                    model,
                    options.stream_options?.include_usage === true,
                ),
                choices: [{ index: 0, delta: {}, finish_reason: null }],
            },
            requestUrl,
        );
    }

    let data: ResponsesData;
    try {
        data = (await response.json()) as ResponsesData;
    } catch (thrown) {
        throw serviceError(
            thrown instanceof Error ? thrown.message : String(thrown),
            requestUrl,
        );
    }
    if (data.error) {
        throw serviceError(
            data.error.message ?? "Text generation failed",
            requestUrl,
            remapUpstreamStatus(data.error.status ?? 502),
            data.error,
        );
    }

    log(
        `[${requestId}] Azure Responses completed in ${Date.now() - started}ms`,
    );
    const completion = parseResponse(data, model);
    completion.id ??= `azure-responses-${requestId}`;
    return withRequestUrl(completion, requestUrl);
}
