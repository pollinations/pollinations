import type {
    CompletionUsage,
    CreateChatCompletionRequest,
} from "@shared/schemas/openai.ts";
import { createParser } from "eventsource-parser";
import { z } from "zod";

// Anthropic Messages API <-> Chat Completions. /v1/messages runs the Chat
// pipeline unchanged; these functions only translate at its edges.

const CacheControl = z.object({ type: z.string() }).passthrough().optional();

const ImageSource = z.union([
    z.object({
        type: z.literal("base64"),
        media_type: z.string(),
        data: z.string(),
    }),
    z.object({ type: z.literal("url"), url: z.string() }),
]);

const Block = z
    .object({ type: z.string(), cache_control: CacheControl })
    .passthrough();

const Content = z.union([z.string(), z.array(Block)]);

export const MessagesRequestSchema = z
    .object({
        model: z.string().optional(),
        max_tokens: z.number().int().min(1).optional(),
        messages: z.array(
            z.object({
                role: z.enum(["user", "assistant"]),
                content: Content,
            }),
        ),
        system: Content.optional(),
        stop_sequences: z.array(z.string()).optional(),
        stream: z.boolean().optional(),
        temperature: z.number().optional(),
        top_p: z.number().optional(),
        tools: z
            .array(
                z
                    .object({
                        name: z.string(),
                        description: z.string().optional(),
                        input_schema: z.record(z.string(), z.unknown()),
                        cache_control: CacheControl,
                    })
                    .passthrough(),
            )
            .optional(),
        tool_choice: z
            .object({
                type: z.enum(["auto", "any", "tool", "none"]),
                name: z.string().optional(),
                disable_parallel_tool_use: z.boolean().optional(),
            })
            .optional(),
        thinking: z
            .object({
                type: z.string(),
                budget_tokens: z.number().optional(),
            })
            .passthrough()
            .optional(),
        output_config: z
            .object({ effort: z.string().optional() })
            .passthrough()
            .optional(),
    })
    // Claude Code sends metadata, container and other fields we ignore.
    .passthrough();

export type MessagesRequest = z.infer<typeof MessagesRequestSchema>;
type RequestBlock = z.infer<typeof Block>;
type ChatPart = Record<string, unknown>;
type ChatMessage = Record<string, unknown>;

const cacheControl = (block: RequestBlock) =>
    block.cache_control ? { cache_control: { type: "ephemeral" } } : {};

function imageUrl(source: unknown): string {
    const parsed = ImageSource.parse(source);
    return parsed.type === "url"
        ? parsed.url
        : `data:${parsed.media_type};base64,${parsed.data}`;
}

function toChatPart(block: RequestBlock): ChatPart | null {
    switch (block.type) {
        case "text":
            return { type: "text", text: block.text, ...cacheControl(block) };
        case "image":
            return {
                type: "image_url",
                image_url: { url: imageUrl(block.source) },
                ...cacheControl(block),
            };
        case "document": {
            const source = block.source as Record<string, string>;
            if (source?.type === "text")
                return { type: "text", text: source.data };
            return {
                type: "file",
                file: {
                    ...(source?.type === "url"
                        ? { file_url: source.url }
                        : {
                              file_data: `data:${source?.media_type};base64,${source?.data}`,
                          }),
                    mime_type: source?.media_type ?? "application/pdf",
                },
                ...cacheControl(block),
            };
        }
        // Earlier reasoning cannot be replayed through Chat Completions.
        case "thinking":
        case "redacted_thinking":
            return null;
        default:
            throw new MessagesRequestError(
                `Unsupported content block type: ${block.type}`,
            );
    }
}

const blocks = (content: string | RequestBlock[]): RequestBlock[] =>
    typeof content === "string" ? [{ type: "text", text: content }] : content;

function parts(content: string | RequestBlock[]): ChatPart[] {
    return blocks(content)
        .map(toChatPart)
        .filter((part): part is ChatPart => part !== null);
}

function toolResultContent(block: RequestBlock) {
    const content = block.content as string | RequestBlock[] | undefined;
    if (content === undefined) return "";
    if (typeof content === "string") return content;
    const converted = parts(content);
    return converted.length ? converted : "";
}

function userMessages(content: string | RequestBlock[]): ChatMessage[] {
    const messages: ChatMessage[] = [];
    const rest: RequestBlock[] = [];
    for (const block of blocks(content)) {
        if (block.type !== "tool_result") {
            rest.push(block);
            continue;
        }
        messages.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: block.is_error
                ? `Error: ${JSON.stringify(toolResultContent(block))}`
                : toolResultContent(block),
            ...cacheControl(block),
        });
    }
    const converted = parts(rest);
    if (converted.length) messages.push({ role: "user", content: converted });
    return messages;
}

function assistantMessage(content: string | RequestBlock[]): ChatMessage {
    const text: string[] = [];
    const toolCalls: unknown[] = [];
    for (const block of blocks(content)) {
        if (block.type === "text") text.push(block.text as string);
        else if (block.type === "tool_use")
            toolCalls.push({
                id: block.id,
                type: "function",
                function: {
                    name: block.name,
                    arguments: JSON.stringify(block.input ?? {}),
                },
            });
    }
    return {
        role: "assistant",
        content: text.length ? text.join("") : null,
        ...(toolCalls.length && { tool_calls: toolCalls }),
    };
}

const BUDGET_EFFORT = [
    [4096, "low"],
    [16384, "medium"],
] as const;

function reasoningEffort(request: MessagesRequest) {
    const effort = request.output_config?.effort;
    if (effort === "low" || effort === "medium" || effort === "high")
        return effort;
    if (effort === "max") return "max";
    if (request.thinking?.type !== "enabled") return undefined;
    const budget = request.thinking.budget_tokens ?? 0;
    return BUDGET_EFFORT.find(([limit]) => budget < limit)?.[1] ?? "high";
}

function toolChoice(choice: MessagesRequest["tool_choice"]) {
    if (!choice) return undefined;
    switch (choice.type) {
        case "any":
            return "required";
        case "tool":
            return { type: "function", function: { name: choice.name } };
        default:
            return choice.type;
    }
}

export class MessagesRequestError extends Error {
    override readonly name = "MessagesRequestError";
}

export function messagesToChatRequest(
    request: MessagesRequest,
): CreateChatCompletionRequest {
    const messages: ChatMessage[] = [];
    if (request.system !== undefined)
        messages.push({ role: "system", content: parts(request.system) });
    for (const message of request.messages) {
        if (message.role === "user")
            messages.push(...userMessages(message.content));
        else messages.push(assistantMessage(message.content));
    }

    const effort = reasoningEffort(request);
    const chat: Record<string, unknown> = {
        model: request.model,
        messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        // Chat Completions accepts at most four stop sequences.
        stop: request.stop_sequences?.length
            ? request.stop_sequences.slice(0, 4)
            : undefined,
        stream: request.stream ?? false,
        ...(request.stream && { stream_options: { include_usage: true } }),
        ...(effort && { reasoning_effort: effort }),
        tools: request.tools?.map((tool) => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema,
            },
        })),
        tool_choice: toolChoice(request.tool_choice),
        ...(request.tool_choice?.disable_parallel_tool_use && {
            parallel_tool_calls: false,
        }),
    };
    for (const key of Object.keys(chat))
        if (chat[key] === undefined) delete chat[key];
    return chat as CreateChatCompletionRequest;
}

// --- Responses ---

type ChatToolCall = {
    id: string;
    function: { name: string; arguments: string };
};

type ChatChoice = {
    finish_reason?: string | null;
    message?: {
        content?: string | null;
        reasoning_content?: string | null;
        content_blocks?: { type: string; thinking?: string }[] | null;
        tool_calls?: ChatToolCall[] | null;
    };
};

type ChatCompletion = {
    id: string;
    model?: string;
    choices: ChatChoice[];
    usage: CompletionUsage;
};

const STOP_REASONS: Record<string, string> = {
    stop: "end_turn",
    length: "max_tokens",
    tool_calls: "tool_use",
    function_call: "tool_use",
    content_filter: "refusal",
};

const stopReason = (finish: string | null | undefined) =>
    STOP_REASONS[finish ?? "stop"] ?? "end_turn";

/** Anthropic reports input_tokens without the cached part. */
export function messagesUsage(usage: CompletionUsage) {
    const details = usage.prompt_tokens_details;
    const cacheRead =
        details?.cached_tokens ??
        usage.cache_read_input_tokens ??
        usage.cached_input_tokens ??
        0;
    const cacheWrite =
        details?.cache_write_tokens ??
        details?.cache_creation_input_tokens ??
        usage.cache_creation_input_tokens ??
        0;
    return {
        input_tokens: Math.max(0, usage.prompt_tokens - cacheRead - cacheWrite),
        output_tokens: usage.completion_tokens,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheWrite,
    };
}

const parseArguments = (value: string) => {
    try {
        return value ? JSON.parse(value) : {};
    } catch {
        return {};
    }
};

const messageId = (id: string) => (id.startsWith("msg_") ? id : `msg_${id}`);

export function chatToMessagesResponse(chat: ChatCompletion) {
    const choice: ChatChoice = chat.choices[0] ?? {};
    const message = choice.message ?? {};
    const thinking =
        message.reasoning_content ??
        message.content_blocks
            ?.filter((block) => block.type === "thinking")
            .map((block) => block.thinking)
            .join("");
    const content: unknown[] = [];
    if (thinking) content.push({ type: "thinking", thinking, signature: "" });
    if (message.content) content.push({ type: "text", text: message.content });
    for (const call of message.tool_calls ?? [])
        content.push({
            type: "tool_use",
            id: call.id,
            name: call.function.name,
            input: parseArguments(call.function.arguments),
        });
    return {
        id: messageId(chat.id),
        type: "message",
        role: "assistant",
        model: chat.model,
        content,
        stop_reason: stopReason(choice.finish_reason),
        stop_sequence: null,
        usage: messagesUsage(chat.usage),
    };
}

// --- Errors ---

const ERROR_TYPES: Record<number, string> = {
    400: "invalid_request_error",
    401: "authentication_error",
    402: "billing_error",
    403: "permission_error",
    404: "not_found_error",
    413: "request_too_large",
    429: "rate_limit_error",
    503: "overloaded_error",
    529: "overloaded_error",
};

export const messagesErrorType = (status: number) =>
    ERROR_TYPES[status] ??
    (status >= 500 ? "api_error" : "invalid_request_error");

export const messagesError = (status: number, message: string) => ({
    type: "error",
    error: { type: messagesErrorType(status), message },
});

// --- Streaming ---

const encoder = new TextEncoder();
const sse = (event: string, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

type ChatChunk = {
    id?: string;
    model?: string;
    error?: { message?: string };
    usage?: CompletionUsage | null;
    choices?: {
        finish_reason?: string | null;
        delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: {
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
            }[];
        };
    }[];
};

/**
 * Turns Chat Completions SSE into Messages SSE. Pure: feed chunks of upstream
 * text, receive encoded Messages events.
 */
export function createMessagesStreamTranslator(model: string | undefined) {
    const out: Uint8Array[] = [];
    let started = false;
    let finished = false;
    let blockIndex = -1;
    let blockKind: string | null = null;
    // Chat tool-call index -> Messages block index.
    const toolBlocks = new Map<number, number>();
    let finishReason: string | null | undefined;
    let usage: CompletionUsage | null | undefined;

    const start = (id = "stream") => {
        if (started) return;
        started = true;
        out.push(
            sse("message_start", {
                type: "message_start",
                message: {
                    id: messageId(id),
                    type: "message",
                    role: "assistant",
                    model,
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 0, output_tokens: 0 },
                },
            }),
        );
    };

    const closeBlock = () => {
        if (blockKind === null) return;
        out.push(
            sse("content_block_stop", {
                type: "content_block_stop",
                index: blockIndex,
            }),
        );
        blockKind = null;
    };

    const openBlock = (kind: string, contentBlock: unknown) => {
        closeBlock();
        blockIndex += 1;
        blockKind = kind;
        out.push(
            sse("content_block_start", {
                type: "content_block_start",
                index: blockIndex,
                content_block: contentBlock,
            }),
        );
    };

    const delta = (index: number, value: unknown) =>
        out.push(
            sse("content_block_delta", {
                type: "content_block_delta",
                index,
                delta: value,
            }),
        );

    const fail = (message: string) => {
        if (finished) return;
        finished = true;
        out.push(sse("error", messagesError(502, message)));
    };

    const finish = () => {
        if (finished) return;
        if (!usage) return fail("Provider omitted usage");
        start();
        closeBlock();
        finished = true;
        out.push(
            sse("message_delta", {
                type: "message_delta",
                delta: {
                    stop_reason: stopReason(finishReason),
                    stop_sequence: null,
                },
                usage: messagesUsage(usage),
            }),
            sse("message_stop", { type: "message_stop" }),
        );
    };

    const onChunk = (chunk: ChatChunk) => {
        if (chunk.error)
            return fail(chunk.error.message ?? "Upstream stream error");
        start(chunk.id);
        if (chunk.usage) usage = chunk.usage;
        for (const choice of chunk.choices ?? []) {
            const d = choice.delta ?? {};
            if (d.reasoning_content) {
                if (blockKind !== "thinking")
                    openBlock("thinking", {
                        type: "thinking",
                        thinking: "",
                        signature: "",
                    });
                delta(blockIndex, {
                    type: "thinking_delta",
                    thinking: d.reasoning_content,
                });
            }
            if (d.content) {
                if (blockKind !== "text")
                    openBlock("text", { type: "text", text: "" });
                delta(blockIndex, { type: "text_delta", text: d.content });
            }
            for (const call of d.tool_calls ?? []) {
                if (!toolBlocks.has(call.index)) {
                    openBlock(`tool:${call.index}`, {
                        type: "tool_use",
                        id: call.id,
                        name: call.function?.name,
                        input: {},
                    });
                    toolBlocks.set(call.index, blockIndex);
                }
                const args = call.function?.arguments;
                if (args)
                    delta(toolBlocks.get(call.index) as number, {
                        type: "input_json_delta",
                        partial_json: args,
                    });
            }
            if (choice.finish_reason) finishReason = choice.finish_reason;
        }
    };

    const parser = createParser({
        onEvent(event) {
            if (finished) return;
            if (event.data === "[DONE]") return finish();
            try {
                onChunk(JSON.parse(event.data) as ChatChunk);
            } catch {
                fail("Provider returned a malformed stream event");
            }
        },
    });
    const decoder = new TextDecoder();

    const drain = () => out.splice(0);
    return {
        feed(bytes: Uint8Array) {
            parser.feed(decoder.decode(bytes, { stream: true }));
            return drain();
        },
        end() {
            parser.feed(`${decoder.decode()}\n\n`);
            if (!finished) fail("Stream ended before completion");
            return drain();
        },
        ping: () => sse("ping", { type: "ping" }),
    };
}

// Claude Code aborts after 300 s without bytes; long silent reasoning must
// still send something.
const PING_INTERVAL_MS = 15_000;

export function chatStreamToMessages(
    body: ReadableStream<Uint8Array>,
    model: string | undefined,
): ReadableStream<Uint8Array> {
    const translator = createMessagesStreamTranslator(model);
    const reader = body.getReader();
    let timer: ReturnType<typeof setInterval> | undefined;
    return new ReadableStream({
        start(controller) {
            timer = setInterval(
                () => controller.enqueue(translator.ping()),
                PING_INTERVAL_MS,
            );
        },
        async pull(controller) {
            const { done, value } = await reader.read();
            const events = done ? translator.end() : translator.feed(value);
            for (const event of events) controller.enqueue(event);
            if (done) {
                clearInterval(timer);
                controller.close();
            }
        },
        cancel(reason) {
            clearInterval(timer);
            return reader.cancel(reason);
        },
    });
}
