import { UpstreamError } from "@shared/error.ts";
import {
    type CompletionUsage,
    CompletionUsageSchema,
    type CreateResponseRequest,
    type ResponseUsage,
} from "@shared/schemas/openai.ts";
import {
    functionOutputText,
    ResponseFunctionCallOutputSchema,
    ResponseFunctionCallSchema,
} from "@shared/schemas/response-function-items.ts";
import { createParser } from "eventsource-parser";
import type { ChatCompletion, ChatMessage, RequestData } from "../types.js";
import { ResponsesInvalidRequestError } from "./request.js";

/**
 * Serve a Responses request on a model that only speaks Chat Completions:
 * translate the request to Chat, let the Chat pipeline call the provider, and
 * translate its JSON or SSE back into Responses items and events.
 */

type JsonObject = Record<string, unknown>;
type Send = (type: string, payload: JsonObject) => void;

function invalid(message: string, param = "input"): never {
    throw new ResponsesInvalidRequestError(message, param);
}

function object(value: unknown, param = "input"): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        invalid(`${param} must be an object`, param);
    }
    return value as JsonObject;
}

function text(value: unknown, param = "input"): string {
    if (typeof value !== "string") invalid(`${param} must be a string`, param);
    return value;
}

function chatPart(raw: unknown): JsonObject {
    const part = object(raw);
    const breakpoint =
        part.prompt_cache_breakpoint === undefined
            ? {}
            : { prompt_cache_breakpoint: part.prompt_cache_breakpoint };
    switch (part.type) {
        case "input_text":
        case "output_text":
        case "text":
            return { type: "text", text: text(part.text), ...breakpoint };
        case "refusal":
            return { type: "text", text: text(part.refusal), ...breakpoint };
        case "input_image": {
            if (typeof part.image_url !== "string" || !part.image_url) {
                invalid("input_image requires an image_url");
            }
            return {
                type: "image_url",
                image_url: {
                    url: part.image_url,
                    ...(part.detail === "low" || part.detail === "high"
                        ? { detail: part.detail }
                        : {}),
                },
                ...breakpoint,
            };
        }
        case "input_file":
            return {
                type: "file",
                file: {
                    ...(typeof part.file_data === "string"
                        ? { file_data: part.file_data }
                        : {}),
                    ...(typeof part.file_url === "string"
                        ? { file_url: part.file_url }
                        : {}),
                    ...(typeof part.filename === "string"
                        ? { file_name: part.filename }
                        : {}),
                },
                ...breakpoint,
            };
        default:
            return invalid(`Unsupported content part: ${String(part.type)}`);
    }
}

function chatContent(content: unknown): string | JsonObject[] {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) invalid("Message content must be an array");
    const parts = content.map(chatPart);
    // Plain text joins into one string: some Chat providers reject part
    // arrays on system and assistant messages.
    return parts.every(
        (part) => part.type === "text" && !part.prompt_cache_breakpoint,
    )
        ? parts.map((part) => part.text).join("")
        : parts;
}

function chatMessages(request: CreateResponseRequest): ChatMessage[] {
    const messages: ChatMessage[] = request.instructions
        ? [{ role: "system", content: request.instructions }]
        : [];
    if (typeof request.input === "string") {
        messages.push({ role: "user", content: request.input });
        return messages;
    }
    const callIds = new Set<string>();
    for (const raw of request.input) {
        const item = object(raw);
        if (item.type === "function_call") {
            const call = ResponseFunctionCallSchema.safeParse(item);
            if (!call.success || callIds.has(call.data.call_id)) {
                invalid(
                    "Function calls need a unique call_id, name and arguments",
                );
            }
            callIds.add(call.data.call_id);
            const toolCall = {
                id: call.data.call_id,
                type: "function",
                function: {
                    name: call.data.name,
                    arguments: call.data.arguments,
                },
            };
            // Chat keeps one turn's text and parallel calls in one message.
            const previous = messages.at(-1);
            if (previous?.role === "assistant") {
                previous.tool_calls = [
                    ...(previous.tool_calls ?? []),
                    toolCall,
                ];
            } else {
                messages.push({
                    role: "assistant",
                    content: null,
                    tool_calls: [toolCall],
                });
            }
            continue;
        }
        if (item.type === "function_call_output") {
            const output = ResponseFunctionCallOutputSchema.safeParse(item);
            if (!output.success || !callIds.has(output.data.call_id)) {
                invalid(
                    "Function call outputs must follow their function call",
                );
            }
            messages.push({
                role: "tool",
                tool_call_id: output.data.call_id,
                content: functionOutputText(output.data.output),
            });
            continue;
        }
        // Stateless: earlier reasoning is not replayed to Chat providers.
        if (item.type === "reasoning") continue;
        if (item.type !== undefined && item.type !== "message") {
            invalid(`Unsupported input item: ${String(item.type)}`);
        }
        const role = text(item.role, "input.role");
        if (!["user", "assistant", "system", "developer"].includes(role)) {
            invalid(`Unsupported message role: ${role}`, "input.role");
        }
        messages.push({ role, content: chatContent(item.content) });
    }
    return messages;
}

function chatResponseFormat(format: unknown): JsonObject | undefined {
    if (format === undefined) return undefined;
    const value = object(format, "text.format");
    if (value.type === "text") return undefined;
    if (value.type === "json_object") return { type: "json_object" };
    if (value.type !== "json_schema") {
        invalid(
            `Unsupported text format: ${String(value.type)}`,
            "text.format",
        );
    }
    return {
        type: "json_schema",
        json_schema: {
            name: text(value.name, "text.format.name"),
            schema: object(value.schema, "text.format.schema"),
            ...(typeof value.description === "string"
                ? { description: value.description }
                : {}),
            ...(typeof value.strict === "boolean"
                ? { strict: value.strict }
                : {}),
        },
    };
}

function chatToolChoice(choice: unknown): unknown {
    if (choice === "auto" || choice === "none" || choice === "required") {
        return choice;
    }
    const value = object(choice, "tool_choice");
    if (value.type !== "function") {
        invalid("Only function tool choices are supported", "tool_choice");
    }
    return {
        type: "function",
        function: { name: text(value.name, "tool_choice.name") },
    };
}

/** Chat request for a Responses request; 400 for anything Chat cannot express. */
export function responsesToChatRequest(
    request: CreateResponseRequest,
): RequestData {
    if (request.max_tool_calls != null) {
        invalid(
            "max_tool_calls is not supported for this model",
            "max_tool_calls",
        );
    }
    if (request.truncation === "auto") {
        invalid("Automatic truncation is not supported", "truncation");
    }
    if (
        (request.top_logprobs ?? 0) > 0 ||
        request.include?.includes("message.output_text.logprobs")
    ) {
        invalid(
            "Log probabilities are not supported for this model",
            "include",
        );
    }
    const effort = request.reasoning?.effort;
    const format = chatResponseFormat(request.text?.format);
    const user = request.safety_identifier ?? request.user;
    const optional = {
        max_tokens: request.max_output_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        reasoning_effort: typeof effort === "string" ? effort : undefined,
        response_format: format,
        tool_choice:
            request.tool_choice === undefined
                ? undefined
                : chatToolChoice(request.tool_choice),
        parallel_tool_calls: request.parallel_tool_calls,
        metadata: request.metadata,
        user,
        prompt_cache_key: request.prompt_cache_key,
        prompt_cache_options: request.prompt_cache_options,
        prompt_cache_retention: request.prompt_cache_retention,
    };
    return {
        ...Object.fromEntries(
            Object.entries(optional).filter(([, value]) => value != null),
        ),
        model: request.model,
        stream: request.stream,
        messages: chatMessages(request),
        ...(request.tools?.length
            ? {
                  tools: request.tools.map((tool) => ({
                      type: "function",
                      function: {
                          name: tool.name,
                          ...(tool.description === undefined
                              ? {}
                              : { description: tool.description }),
                          ...(tool.parameters === undefined
                              ? {}
                              : { parameters: tool.parameters }),
                          ...(tool.strict == null
                              ? {}
                              : { strict: tool.strict }),
                      },
                  })),
              }
            : {}),
    } as RequestData;
}

/**
 * Responses usage carrying exactly the Chat counts: Chat's top-level cache and
 * reasoning fields move into the detail objects `responsesUsageToUsage` reads.
 */
export function chatUsageToResponsesUsage(
    usage: CompletionUsage,
): ResponseUsage {
    const prompt = usage.prompt_tokens_details ?? {};
    const completion = usage.completion_tokens_details ?? {};
    return {
        input_tokens: usage.prompt_tokens,
        input_tokens_details: {
            ...prompt,
            cached_tokens:
                prompt.cached_tokens ||
                usage.cached_input_tokens ||
                usage.cache_read_input_tokens ||
                0,
            cache_write_tokens:
                prompt.cache_write_tokens ??
                prompt.cache_creation_input_tokens ??
                usage.cache_creation_input_tokens ??
                0,
        },
        output_tokens: usage.completion_tokens,
        output_tokens_details: {
            ...completion,
            reasoning_tokens:
                completion.reasoning_tokens || usage.reasoning_tokens || 0,
        },
        total_tokens: usage.total_tokens,
    };
}

type PartKind = "reasoning" | "text" | "refusal";
type ToolCall = { id?: string; name: string; arguments: string };

const PART_EVENTS: Record<PartKind, { delta: string; done: string }> = {
    reasoning: {
        delta: "response.reasoning.delta",
        done: "response.reasoning.done",
    },
    text: {
        delta: "response.output_text.delta",
        done: "response.output_text.done",
    },
    refusal: { delta: "response.refusal.delta", done: "response.refusal.done" },
};

function emptyPart(kind: PartKind): JsonObject {
    if (kind === "reasoning") return { type: "reasoning_text", text: "" };
    if (kind === "refusal") return { type: "refusal", refusal: "" };
    return { type: "output_text", text: "", annotations: [], logprobs: [] };
}

/**
 * Ordered output items, optionally streamed as Open Responses events. JSON
 * and SSE responses both build their output here, so they cannot diverge.
 */
function outputCollector(send: Send = () => {}) {
    const items: JsonObject[] = [];
    let item: JsonObject | undefined;
    let part: { kind: PartKind; value: JsonObject; index: number } | undefined;

    const closePart = () => {
        if (!item || !part) return;
        const field = part.kind === "refusal" ? "refusal" : "text";
        const position = {
            item_id: item.id,
            output_index: items.indexOf(item),
            content_index: part.index,
        };
        send(PART_EVENTS[part.kind].done, {
            ...position,
            [field]: part.value[field],
            ...(part.kind === "text" ? { logprobs: [] } : {}),
        });
        send("response.content_part.done", { ...position, part: part.value });
        part = undefined;
    };
    const closeItem = (status: "completed" | "incomplete" = "completed") => {
        if (!item) return;
        closePart();
        if (item.type === "message") item.status = status;
        send("response.output_item.done", {
            output_index: items.indexOf(item),
            item,
        });
        item = undefined;
    };
    const openItem = (value: JsonObject) => {
        closeItem();
        item = value;
        items.push(item);
        send("response.output_item.added", {
            output_index: items.length - 1,
            item: { ...item, content: [] },
        });
    };

    return {
        items,
        delta(kind: PartKind, value: unknown) {
            if (typeof value !== "string" || !value) return;
            const type = kind === "reasoning" ? "reasoning" : "message";
            if (item?.type !== type) {
                openItem(
                    type === "reasoning"
                        ? {
                              type,
                              id: `rs_${crypto.randomUUID()}`,
                              summary: [],
                              content: [],
                          }
                        : {
                              type,
                              id: `msg_${crypto.randomUUID()}`,
                              role: "assistant",
                              status: "in_progress",
                              content: [],
                          },
                );
            }
            const current = item as JsonObject & { content: JsonObject[] };
            if (part?.kind !== kind) {
                closePart();
                part = {
                    kind,
                    value: emptyPart(kind),
                    index: current.content.length,
                };
                current.content.push(part.value);
                send("response.content_part.added", {
                    item_id: current.id,
                    output_index: items.indexOf(current),
                    content_index: part.index,
                    part: { ...part.value },
                });
            }
            const field = kind === "refusal" ? "refusal" : "text";
            part.value[field] = `${part.value[field]}${value}`;
            send(PART_EVENTS[kind].delta, {
                item_id: current.id,
                output_index: items.indexOf(current),
                content_index: part.index,
                delta: value,
                ...(kind === "text" ? { logprobs: [] } : {}),
            });
        },
        finish(finishReason: string | null | undefined, calls: ToolCall[]) {
            closeItem(isIncomplete(finishReason) ? "incomplete" : "completed");
            for (const call of calls) {
                const value = {
                    type: "function_call",
                    id: `fc_${crypto.randomUUID()}`,
                    call_id: call.id || `call_${crypto.randomUUID()}`,
                    name: call.name,
                    arguments: call.arguments,
                    status: "completed",
                };
                items.push(value);
                const position = {
                    item_id: value.id,
                    output_index: items.length - 1,
                };
                send("response.output_item.added", {
                    output_index: position.output_index,
                    item: { ...value, arguments: "", status: "in_progress" },
                });
                send("response.function_call_arguments.delta", {
                    ...position,
                    delta: value.arguments,
                });
                send("response.function_call_arguments.done", {
                    ...position,
                    arguments: value.arguments,
                });
                send("response.output_item.done", {
                    output_index: position.output_index,
                    item: value,
                });
            }
            return items;
        },
    };
}

function isIncomplete(finishReason: string | null | undefined): boolean {
    return finishReason === "length" || finishReason === "content_filter";
}

function messageText(content: unknown): string | undefined {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return undefined;
    return content
        .map((part) =>
            part && typeof part === "object" && typeof part.text === "string"
                ? part.text
                : "",
        )
        .join("");
}

function thinkingText(blocks: unknown, key: "thinking" | "delta"): string {
    if (!Array.isArray(blocks)) return "";
    return blocks
        .map((block) => {
            const value = key === "delta" ? block?.delta : block;
            return typeof value?.thinking === "string" ? value.thinking : "";
        })
        .join("");
}

function toolArguments(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value ?? {});
}

/** The Response object around the given output, echoing request settings. */
function responseObject(
    request: CreateResponseRequest,
    model: string,
    id: string,
    createdAt: number,
    fields: {
        status: "in_progress" | "completed" | "incomplete" | "failed";
        output: JsonObject[];
        usage: ResponseUsage | null;
        finishReason?: string | null;
        error?: { code: string; message: string };
    },
) {
    const incomplete = fields.status === "incomplete";
    return {
        id,
        object: "response",
        created_at: createdAt,
        completed_at:
            fields.status === "completed"
                ? Math.floor(Date.now() / 1000)
                : null,
        status: fields.status,
        incomplete_details: incomplete
            ? {
                  reason:
                      fields.finishReason === "content_filter"
                          ? "content_filter"
                          : "max_output_tokens",
              }
            : null,
        model,
        previous_response_id: null,
        instructions: request.instructions ?? null,
        output: fields.output,
        error: fields.error ?? null,
        tools: (request.tools ?? []).map((tool) => ({
            type: "function",
            name: tool.name,
            description: tool.description ?? null,
            parameters: tool.parameters ?? null,
            strict: tool.strict ?? null,
        })),
        tool_choice: request.tool_choice ?? "auto",
        truncation: "disabled",
        parallel_tool_calls: request.parallel_tool_calls ?? true,
        text: { format: { type: "text" }, ...request.text },
        top_p: request.top_p ?? 1,
        presence_penalty: request.presence_penalty ?? 0,
        frequency_penalty: request.frequency_penalty ?? 0,
        top_logprobs: 0,
        temperature: request.temperature ?? 1,
        reasoning: request.reasoning
            ? {
                  effort: request.reasoning.effort ?? null,
                  summary: request.reasoning.summary ?? null,
              }
            : null,
        user: request.user ?? null,
        usage: fields.usage,
        max_output_tokens: request.max_output_tokens ?? null,
        max_tool_calls: null,
        store: false,
        background: false,
        service_tier: "default",
        metadata: request.metadata ?? {},
        safety_identifier: request.safety_identifier ?? null,
        prompt_cache_key: request.prompt_cache_key ?? null,
    };
}

/** Responses JSON for a Chat completion whose usage the Chat pipeline checked. */
export function chatCompletionToResponse(
    request: CreateResponseRequest,
    model: string,
    completion: ChatCompletion,
) {
    const choice = completion.choices?.[0];
    const message = choice?.message;
    const usage = CompletionUsageSchema.safeParse(completion.usage);
    if (!message || !usage.success) {
        throw new UpstreamError(502, {
            message:
                "Chat Completions provider returned an invalid response or omitted usage",
            requestUrl: completion.upstreamRequestUrl,
        });
    }
    const output = outputCollector();
    output.delta(
        "reasoning",
        message.reasoning_content ??
            message.reasoning ??
            thinkingText(message.content_blocks, "thinking"),
    );
    output.delta("text", messageText(message.content));
    output.delta("refusal", message.refusal);
    const calls = ((message.tool_calls ?? []) as JsonObject[]).map((call) => {
        const fn = (call.function ?? {}) as JsonObject;
        return {
            id: typeof call.id === "string" ? call.id : undefined,
            name: String(fn.name ?? ""),
            arguments: toolArguments(fn.arguments),
        };
    });
    return responseObject(
        request,
        model,
        `resp_${crypto.randomUUID()}`,
        Math.floor(Date.now() / 1000),
        {
            status: isIncomplete(choice.finish_reason)
                ? "incomplete"
                : "completed",
            output: output.finish(choice.finish_reason, calls),
            usage: chatUsageToResponsesUsage(usage.data),
            finishReason: choice.finish_reason,
        },
    );
}

type ChatChunk = {
    choices?: {
        delta?: JsonObject & {
            tool_calls?: {
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
            }[];
        };
        finish_reason?: string | null;
    }[];
    usage?: unknown;
    error?: { message?: unknown; code?: unknown };
};

/**
 * Responses SSE for a usage-validated Chat SSE stream. Text and reasoning
 * stream as they arrive; tool calls are emitted whole when the model stops,
 * because providers may interleave the arguments of parallel calls.
 */
export function chatStreamToResponsesStream(
    body: ReadableStream<Uint8Array>,
    request: CreateResponseRequest,
    model: string,
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const responseId = `resp_${crypto.randomUUID()}`;
    const createdAt = Math.floor(Date.now() / 1000);
    const calls = new Map<number, ToolCall>();
    let finishReason: string | null | undefined;
    let usage: unknown;
    let sequenceNumber = 0;
    let ended = false;
    let out!: TransformStreamDefaultController<Uint8Array>;

    const send: Send = (type, payload) => {
        if (ended) return;
        out.enqueue(
            encoder.encode(
                `event: ${type}\ndata: ${JSON.stringify({
                    type,
                    sequence_number: sequenceNumber++,
                    ...payload,
                })}\n\n`,
            ),
        );
    };
    const output = outputCollector(send);
    const snapshot = (fields: Parameters<typeof responseObject>[4]) =>
        responseObject(request, model, responseId, createdAt, fields);
    const end = () => {
        if (ended) return;
        out.enqueue(encoder.encode("data: [DONE]\n\n"));
        ended = true;
    };
    const fail = (code: string, message: string) => {
        // Open Responses nests the error payload; OpenAI SDKs read it flat.
        send("error", {
            code,
            message,
            param: null,
            error: { type: "server_error", code, message, param: null },
        });
        send("response.failed", {
            response: snapshot({
                status: "failed",
                output: output.items,
                usage: null,
                error: { code, message },
            }),
        });
        end();
    };
    const complete = () => {
        const parsed = CompletionUsageSchema.safeParse(usage);
        if (!parsed.success) {
            fail(
                "usage_missing",
                "Chat Completions provider returned invalid or omitted terminal usage",
            );
            return;
        }
        const items = output.finish(finishReason, [...calls.values()]);
        const status = isIncomplete(finishReason) ? "incomplete" : "completed";
        send(`response.${status}`, {
            response: snapshot({
                status,
                output: items,
                usage: chatUsageToResponsesUsage(parsed.data),
                finishReason,
            }),
        });
        end();
    };
    const onChunk = (chunk: ChatChunk) => {
        if (chunk.error) {
            const { code, message } = chunk.error;
            fail(
                typeof code === "string" ? code : "upstream_error",
                typeof message === "string"
                    ? message
                    : "Provider stream failed",
            );
            return;
        }
        // Providers may send provisional counts before the final usage.
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices?.[0];
        if (!choice) return;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta ?? {};
        output.delta(
            "reasoning",
            delta.reasoning_content ??
                delta.reasoning ??
                thinkingText(delta.content_blocks, "delta"),
        );
        output.delta("text", delta.content);
        output.delta("refusal", delta.refusal);
        for (const call of delta.tool_calls ?? []) {
            const index = call.index ?? calls.size;
            const current = calls.get(index) ?? { name: "", arguments: "" };
            current.id ||= call.id;
            current.name += call.function?.name ?? "";
            current.arguments += call.function?.arguments ?? "";
            calls.set(index, current);
        }
    };
    const parser = createParser({
        onEvent(event) {
            if (ended) return;
            if (event.data.trim() === "[DONE]") return complete();
            let chunk: ChatChunk;
            try {
                chunk = JSON.parse(event.data);
            } catch {
                return;
            }
            onChunk(chunk);
        },
    });

    return body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            start(controller) {
                out = controller;
                const response = snapshot({
                    status: "in_progress",
                    output: [],
                    usage: null,
                });
                send("response.created", { response });
                send("response.in_progress", { response });
            },
            transform(chunk) {
                parser.feed(decoder.decode(chunk, { stream: true }));
            },
            flush() {
                parser.feed(`${decoder.decode()}\n\n`);
                // A stream cut before [DONE] must not look complete.
                fail(
                    "upstream_stream_error",
                    "Chat Completions provider ended the stream early",
                );
            },
        }),
    );
}
