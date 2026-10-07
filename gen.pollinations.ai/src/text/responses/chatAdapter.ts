import { collectOutput } from "@shared/agents/output.ts";
import { responseConfiguration } from "@shared/agents/responses.ts";
import type { AgentPart } from "@shared/agents/types.ts";
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
import type { ChatCompletion, RequestData } from "../types.js";
import { ResponsesInvalidRequestError } from "./request.js";

/**
 * Run a chat-only model on /v1/responses: translate the request to Chat
 * Completions, let the chat pipeline call the provider, and translate the
 * answer back. Chat usage is carried over unchanged, so billing is the same
 * as on /v1/chat/completions.
 */

type JsonObject = Record<string, unknown>;

const REASONING_EFFORTS = [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
];

function invalid(message: string, param: string): never {
    throw new ResponsesInvalidRequestError(message, param);
}

function objectValue(value: unknown, param: string): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        invalid(`${param} must be an object`, param);
    }
    return value as JsonObject;
}

function stringValue(value: unknown, param: string): string {
    if (typeof value !== "string") invalid(`${param} must be a string`, param);
    return value;
}

function promptCacheBreakpoint(part: JsonObject): JsonObject {
    if (part.prompt_cache_breakpoint === undefined) return {};
    const breakpoint = part.prompt_cache_breakpoint as JsonObject | null;
    if (breakpoint?.mode !== "explicit") {
        invalid(
            'prompt_cache_breakpoint must be { "mode": "explicit" }',
            "input.prompt_cache_breakpoint",
        );
    }
    return { prompt_cache_breakpoint: { mode: "explicit" } };
}

function textContent(
    content: unknown,
    role: "assistant" | "developer" | "system",
): string | JsonObject[] {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) {
        invalid("Message content must be text", "input");
    }
    const validTypes =
        role === "assistant" ? ["output_text", "text"] : ["input_text", "text"];
    const parts = content.map((raw): JsonObject => {
        const part = objectValue(raw, "input");
        if (!validTypes.includes(String(part.type))) {
            invalid(
                `Unsupported ${role} content part: ${String(part.type)}`,
                "input",
            );
        }
        return {
            type: "text",
            text: stringValue(part.text, "input"),
            ...promptCacheBreakpoint(part),
        };
    });
    // Parts only when a cache breakpoint has to stay on its own part.
    return parts.some((part) => part.prompt_cache_breakpoint)
        ? parts
        : parts.map((part) => part.text).join("");
}

function userContent(content: unknown): string | JsonObject[] {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) {
        invalid("User message content must be text or an array", "input");
    }
    return content.map((raw): JsonObject => {
        const part = objectValue(raw, "input");
        if (part.type === "input_text" || part.type === "text") {
            return {
                type: "text",
                text: stringValue(part.text, "input"),
                ...promptCacheBreakpoint(part),
            };
        }
        if (part.type === "input_image") {
            if (typeof part.image_url !== "string" || !part.image_url) {
                invalid("input_image requires an image_url", "input");
            }
            return {
                type: "image_url",
                image_url: {
                    url: part.image_url,
                    ...(typeof part.detail === "string"
                        ? { detail: part.detail }
                        : {}),
                },
                ...promptCacheBreakpoint(part),
            };
        }
        return invalid(
            `Unsupported user content part: ${String(part.type)}`,
            "input",
        );
    });
}

function inputMessages(request: CreateResponseRequest): JsonObject[] {
    const messages: JsonObject[] = [];
    if (request.instructions) {
        messages.push({ role: "system", content: request.instructions });
    }
    if (typeof request.input === "string") {
        messages.push({ role: "user", content: request.input });
        return messages;
    }

    const callIds = new Set<string>();
    for (const raw of request.input) {
        const item = objectValue(raw, "input");
        if (item.type === "function_call") {
            const parsed = ResponseFunctionCallSchema.safeParse(item);
            if (!parsed.success || callIds.has(parsed.data.call_id)) {
                invalid(
                    "Tool history must contain unique function calls",
                    "input",
                );
            }
            callIds.add(parsed.data.call_id);
            const call = {
                id: parsed.data.call_id,
                type: "function",
                function: {
                    name: parsed.data.name,
                    arguments: parsed.data.arguments,
                },
            };
            // Chat keeps a turn's calls, and the text before them, together.
            const previous = messages.at(-1);
            if (previous?.role === "assistant" && previous.tool_calls) {
                (previous.tool_calls as JsonObject[]).push(call);
            } else if (previous?.role === "assistant") {
                previous.tool_calls = [call];
            } else {
                messages.push({
                    role: "assistant",
                    content: null,
                    tool_calls: [call],
                });
            }
            continue;
        }
        if (item.type === "function_call_output") {
            const parsed = ResponseFunctionCallOutputSchema.safeParse(item);
            if (!parsed.success || !callIds.has(parsed.data.call_id)) {
                invalid(
                    "Function outputs must match a function call in the input",
                    "input",
                );
            }
            messages.push({
                role: "tool",
                tool_call_id: parsed.data.call_id,
                content: functionOutputText(parsed.data.output),
            });
            continue;
        }
        // Reasoning items carry provider state that Chat cannot accept back.
        if (item.type === "reasoning") continue;
        if (item.type && item.type !== "message") {
            invalid(
                `Unsupported Responses input item: ${String(item.type)}`,
                "input",
            );
        }
        const role = stringValue(item.role, "input");
        if (role === "system" || role === "developer") {
            messages.push({ role, content: textContent(item.content, role) });
        } else if (role === "assistant") {
            messages.push({ role, content: textContent(item.content, role) });
        } else if (role === "user") {
            messages.push({ role, content: userContent(item.content) });
        } else {
            invalid(`Unsupported Responses message role: ${role}`, "input");
        }
    }
    return messages;
}

function hasPromptCacheBreakpoint(messages: JsonObject[]): boolean {
    return messages.some(
        (message) =>
            Array.isArray(message.content) &&
            message.content.some((part) => "prompt_cache_breakpoint" in part),
    );
}

function responseFormat(format: unknown): JsonObject | undefined {
    if (format === undefined) return undefined;
    const value = objectValue(format, "text.format");
    if (value.type === "text") return undefined;
    if (value.type === "json_object") return { type: "json_object" };
    if (value.type === "json_schema") {
        return {
            type: "json_schema",
            json_schema: {
                name: stringValue(value.name, "text.format.name"),
                ...(typeof value.description === "string"
                    ? { description: value.description }
                    : {}),
                schema: value.schema,
                ...(typeof value.strict === "boolean"
                    ? { strict: value.strict }
                    : {}),
            },
        };
    }
    return invalid(
        `Unsupported text format: ${String(value.type)}`,
        "text.format",
    );
}

function toolChoice(choice: unknown): unknown {
    if (choice === undefined || typeof choice === "string") {
        if (
            choice !== undefined &&
            !["auto", "none", "required"].includes(choice)
        ) {
            invalid("Unsupported tool_choice", "tool_choice");
        }
        return choice;
    }
    const value = objectValue(choice, "tool_choice");
    if (value.type !== "function") {
        invalid("Only function tool choices are supported", "tool_choice");
    }
    return {
        type: "function",
        function: { name: stringValue(value.name, "tool_choice.name") },
    };
}

/** Chat Completions request for a Responses request. Throws a 400-class error for anything Chat cannot express. */
export function responsesToChatRequest(
    request: CreateResponseRequest,
): RequestData {
    if (request.max_tool_calls != null) {
        invalid(
            "max_tool_calls is not supported by this model's Responses adapter",
            "max_tool_calls",
        );
    }
    if (
        (request.top_logprobs ?? 0) > 0 ||
        request.include?.includes("message.output_text.logprobs")
    ) {
        invalid(
            "Log probabilities are not supported by this model's Responses adapter",
            "top_logprobs",
        );
    }
    if (request.truncation === "auto") {
        invalid("Automatic truncation is not supported", "truncation");
    }
    const effort = request.reasoning?.effort;
    if (effort != null && !REASONING_EFFORTS.includes(String(effort))) {
        invalid("Invalid reasoning effort", "reasoning.effort");
    }

    const messages = inputMessages(request);
    const format = responseFormat(request.text?.format);
    const promptCacheOptions =
        request.prompt_cache_options ??
        (hasPromptCacheBreakpoint(messages) ? { mode: "explicit" } : null);
    return {
        model: request.model,
        messages,
        stream: request.stream,
        ...(request.stream ? { stream_options: { include_usage: true } } : {}),
        ...(request.max_output_tokens
            ? { max_tokens: request.max_output_tokens }
            : {}),
        ...(request.temperature == null
            ? {}
            : { temperature: request.temperature }),
        ...(request.top_p == null ? {} : { top_p: request.top_p }),
        ...(request.frequency_penalty == null
            ? {}
            : { frequency_penalty: request.frequency_penalty }),
        ...(request.presence_penalty == null
            ? {}
            : { presence_penalty: request.presence_penalty }),
        ...(effort == null ? {} : { reasoning_effort: String(effort) }),
        ...(format ? { response_format: format } : {}),
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
        ...(request.tool_choice === undefined
            ? {}
            : { tool_choice: toolChoice(request.tool_choice) }),
        ...(request.parallel_tool_calls === undefined
            ? {}
            : { parallel_tool_calls: request.parallel_tool_calls }),
        ...(request.metadata ? { metadata: request.metadata } : {}),
        ...(request.safety_identifier || request.user
            ? { user: request.safety_identifier ?? request.user }
            : {}),
        ...(request.service_tier ? { service_tier: request.service_tier } : {}),
        ...(request.prompt_cache_key
            ? { prompt_cache_key: request.prompt_cache_key }
            : {}),
        ...(promptCacheOptions
            ? { prompt_cache_options: promptCacheOptions }
            : {}),
        ...(request.prompt_cache_retention
            ? { prompt_cache_retention: request.prompt_cache_retention }
            : {}),
    } as RequestData;
}

/**
 * Responses usage for Chat usage. Chat's top-level cache and reasoning counts
 * move into the detail objects, which is where `responsesUsageToUsage` reads
 * them, so both APIs bill the same tokens.
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

function responseObject(
    request: CreateResponseRequest,
    model: string,
    id: string,
    createdAt: number,
    output: unknown[],
    usage: CompletionUsage,
    finishReason: string | null | undefined,
) {
    const incomplete =
        finishReason === "length" || finishReason === "content_filter";
    return {
        id,
        object: "response" as const,
        created_at: createdAt,
        completed_at: incomplete ? null : Math.floor(Date.now() / 1000),
        status: incomplete ? ("incomplete" as const) : ("completed" as const),
        incomplete_details: incomplete
            ? {
                  reason:
                      finishReason === "content_filter"
                          ? "content_filter"
                          : "max_output_tokens",
              }
            : null,
        model,
        output,
        error: null,
        usage: chatUsageToResponsesUsage(usage),
        ...requestEcho(request),
    };
}

/** The request settings a Response reports back. */
function requestEcho(request: CreateResponseRequest) {
    return {
        ...responseConfiguration(
            request,
            new Set((request.tools ?? []).map((tool) => tool.name)),
        ),
        tool_choice: request.tool_choice ?? "auto",
        parallel_tool_calls: request.parallel_tool_calls ?? true,
        text: request.text ?? { format: { type: "text" } },
    };
}

function toolCallPart(call: {
    id: string;
    name: string;
    arguments: string;
}): AgentPart {
    return {
        type: "tool-call",
        toolCallId: call.id,
        toolName: call.name,
        input: JSON.parse(call.arguments || "{}"),
    } as AgentPart;
}

function invalidToolArguments(): never {
    throw new UpstreamError(502, {
        message: "Chat Completions provider returned invalid tool arguments",
    });
}

/** Responses JSON for a Chat completion that already carries valid usage. */
export function chatCompletionToResponse(
    completion: ChatCompletion,
    request: CreateResponseRequest,
    model: string,
) {
    const choice = completion.choices?.[0];
    const message = choice?.message as JsonObject | undefined;
    const usage = CompletionUsageSchema.safeParse(completion.usage);
    if (!message || !usage.success) {
        throw new UpstreamError(502, {
            message:
                "Chat Completions provider returned an invalid response or omitted usage",
            requestUrl: completion.upstreamRequestUrl,
        });
    }
    const collected = collectOutput();
    const reasoning = message.reasoning_content ?? message.reasoning;
    if (typeof reasoning === "string") {
        collected.onPart({ type: "reasoning-delta", text: reasoning });
    }
    const text = message.content ?? message.refusal;
    if (typeof text === "string") {
        collected.onPart({ type: "text-delta", text });
    }
    const calls = (message.tool_calls ?? []) as {
        id: string;
        function: { name: string; arguments: string };
    }[];
    try {
        for (const call of calls) {
            collected.onPart(
                toolCallPart({
                    id: call.id,
                    name: call.function.name,
                    arguments: call.function.arguments,
                }),
            );
        }
    } catch {
        invalidToolArguments();
    }
    return responseObject(
        request,
        model,
        `resp_${crypto.randomUUID()}`,
        Math.floor(Date.now() / 1000),
        collected.finish(
            choice?.finish_reason ?? "stop",
            new Set(calls.map((call) => call.function.name)),
        ),
        usage.data,
        choice?.finish_reason,
    );
}

type ChatDelta = {
    content?: string | null;
    refusal?: string | null;
    reasoning_content?: string | null;
    reasoning?: string | null;
    tool_calls?: {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
    }[];
};

type ChatChunk = {
    choices?: { delta?: ChatDelta; finish_reason?: string | null }[];
    usage?: unknown;
    error?: { message?: string };
};

type ToolCall = { id: string; name: string; arguments: string };

/**
 * Responses SSE for a Chat SSE stream. Text and reasoning stream as they
 * arrive; tool calls are emitted whole when the model finishes, because chat
 * providers may interleave the arguments of parallel calls.
 */
export function chatToResponsesStream(
    body: ReadableStream<Uint8Array>,
    request: CreateResponseRequest,
    model: string,
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = body.getReader();
    const responseId = `resp_${crypto.randomUUID()}`;
    const createdAt = Math.floor(Date.now() / 1000);
    const toolCalls = new Map<number, ToolCall>();
    let finishReason: string | null | undefined;
    let usage: unknown;
    let sequenceNumber = 0;
    let ended = false;

    return new ReadableStream<Uint8Array>({
        start(controller) {
            const send = (type: string, payload: JsonObject) => {
                if (ended) return;
                controller.enqueue(
                    encoder.encode(
                        `event: ${type}\ndata: ${JSON.stringify({
                            type,
                            sequence_number: sequenceNumber++,
                            ...payload,
                        })}\n\n`,
                    ),
                );
            };
            const collected = collectOutput(send);
            const inProgress = {
                id: responseId,
                object: "response",
                created_at: createdAt,
                completed_at: null,
                status: "in_progress",
                incomplete_details: null,
                model,
                output: [],
                error: null,
                usage: null,
                ...requestEcho(request),
            };
            const finish = () => {
                if (ended) return;
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                ended = true;
                controller.close();
            };
            const fail = (message: string) => {
                const error = { code: "upstream_error", message };
                send("error", { ...error, param: null });
                send("response.failed", {
                    response: {
                        ...inProgress,
                        status: "failed",
                        output: collected.items,
                        error,
                    },
                });
                finish();
            };
            const complete = () => {
                const parsed = CompletionUsageSchema.safeParse(usage);
                if (!parsed.success) {
                    fail(
                        "Chat Completions provider returned invalid or omitted terminal usage",
                    );
                    return;
                }
                let output: unknown[];
                try {
                    for (const call of toolCalls.values()) {
                        collected.onPart(toolCallPart(call));
                    }
                    output = collected.finish(
                        finishReason ?? "stop",
                        new Set(
                            [...toolCalls.values()].map((call) => call.name),
                        ),
                    );
                } catch {
                    fail(
                        "Chat Completions provider returned invalid tool arguments",
                    );
                    return;
                }
                const response = responseObject(
                    request,
                    model,
                    responseId,
                    createdAt,
                    output,
                    parsed.data,
                    finishReason,
                );
                send(
                    response.status === "incomplete"
                        ? "response.incomplete"
                        : "response.completed",
                    { response },
                );
                finish();
            };
            const onChunk = (chunk: ChatChunk) => {
                if (chunk.error) {
                    fail(chunk.error.message ?? "Provider stream failed");
                    return;
                }
                // Providers may send provisional counts before the final usage.
                if (chunk.usage) usage = chunk.usage;
                const choice = chunk.choices?.[0];
                if (!choice) return;
                if (choice.finish_reason) finishReason = choice.finish_reason;
                const delta = choice.delta ?? {};
                const reasoning = delta.reasoning_content ?? delta.reasoning;
                if (reasoning) {
                    collected.onPart({
                        type: "reasoning-delta",
                        text: reasoning,
                    });
                }
                const text = delta.content ?? delta.refusal;
                if (text) collected.onPart({ type: "text-delta", text });
                for (const call of delta.tool_calls ?? []) {
                    const index = call.index ?? toolCalls.size;
                    const existing = toolCalls.get(index) ?? {
                        id: call.id ?? `call_${index}`,
                        name: "",
                        arguments: "",
                    };
                    existing.name += call.function?.name ?? "";
                    existing.arguments += call.function?.arguments ?? "";
                    toolCalls.set(index, existing);
                }
            };
            const parser = createParser({
                onEvent(event) {
                    if (ended) return;
                    if (event.data.trim() === "[DONE]") {
                        complete();
                        return;
                    }
                    try {
                        onChunk(JSON.parse(event.data) as ChatChunk);
                    } catch {
                        // Non-JSON keepalive or comment payloads carry nothing.
                    }
                },
            });

            send("response.created", { response: inProgress });
            send("response.in_progress", { response: inProgress });
            (async () => {
                try {
                    // Read to the end even after the client stream closes:
                    // cancelling the chat response early left its text-cache
                    // write unfinished, so the request never settled.
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (!ended) {
                            parser.feed(
                                decoder.decode(value, { stream: true }),
                            );
                        }
                    }
                    if (!ended) fail("Provider stream ended before completion");
                } catch (error) {
                    fail(
                        error instanceof Error ? error.message : String(error),
                    );
                }
            })();
        },
        cancel(reason) {
            ended = true;
            return reader.cancel(reason);
        },
    });
}
