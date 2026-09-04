import {
    type CreateResponseRequest,
    CreateResponseRequestSchema,
    CreateResponseResponseSchema,
    type ResponseUsage,
    ResponseUsageSchema,
} from "@shared/schemas/openai.ts";
import { APICallError, type ModelMessage } from "ai";
import { z } from "zod";
import {
    type AgentOutput,
    buildUsage,
    type PromptAgentGenerationSettings,
    type PromptAgentRuntime,
    runPromptAgent,
    streamPromptAgent,
} from "./prompt-agent-runtime.ts";

export const PromptAgentResponsesRequestSchema =
    CreateResponseRequestSchema.extend({ model: z.string().uuid() });

export type PromptAgentResponsesRequest = z.output<
    typeof PromptAgentResponsesRequestSchema
>;

type JsonObject = Record<string, unknown>;
type UserMessage = Extract<ModelMessage, { role: "user" }>;
type PromptCacheProviderOptions = {
    openaiCompatible: {
        prompt_cache_breakpoint: { mode: "explicit" };
    };
};

class AgentResponsesRequestError extends Error {
    constructor(
        message: string,
        readonly param: string,
    ) {
        super(message);
    }
}

function invalidRequest(message: string, param: string): never {
    throw new AgentResponsesRequestError(message, param);
}

function objectValue(value: unknown, param: string): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        invalidRequest(`${param} must be an object`, param);
    }
    return value as JsonObject;
}

function stringValue(value: unknown, param: string): string {
    if (typeof value !== "string") {
        invalidRequest(`${param} must be a string`, param);
    }
    return value;
}

function promptCacheProviderOptions(
    value: JsonObject,
): PromptCacheProviderOptions | undefined {
    if (value.prompt_cache_breakpoint === undefined) return undefined;
    const breakpoint = objectValue(
        value.prompt_cache_breakpoint,
        "input.prompt_cache_breakpoint",
    );
    if (breakpoint.mode !== "explicit") {
        invalidRequest(
            'prompt_cache_breakpoint must be { "mode": "explicit" }',
            "input.prompt_cache_breakpoint",
        );
    }
    return {
        openaiCompatible: {
            prompt_cache_breakpoint: { mode: "explicit" },
        },
    };
}

function hasPromptCacheBreakpoint(
    input: CreateResponseRequest["input"],
): boolean {
    return (
        Array.isArray(input) &&
        input.some((raw) => {
            if (!raw || typeof raw !== "object" || !("content" in raw)) {
                return false;
            }
            const content = (raw as JsonObject).content;
            return (
                Array.isArray(content) &&
                content.some(
                    (part) =>
                        part != null &&
                        typeof part === "object" &&
                        "prompt_cache_breakpoint" in part,
                )
            );
        })
    );
}

function textContent(
    content: unknown,
    role: "assistant" | "developer" | "system",
): { content: string; providerOptions?: PromptCacheProviderOptions } {
    if (typeof content === "string") return { content };
    if (!Array.isArray(content)) {
        invalidRequest("Message content must be text", "input");
    }
    let providerOptions: PromptCacheProviderOptions | undefined;
    const text = content
        .map((raw) => {
            const part = objectValue(raw, "input");
            const validTypes =
                role === "assistant"
                    ? ["output_text", "text"]
                    : ["input_text", "text"];
            if (!validTypes.includes(String(part.type))) {
                invalidRequest(
                    `Unsupported ${role} content part: ${String(part.type)}`,
                    "input",
                );
            }
            providerOptions =
                promptCacheProviderOptions(part) ?? providerOptions;
            return stringValue(part.text, "input");
        })
        .join("");
    return { content: text, ...(providerOptions ? { providerOptions } : {}) };
}

function userContent(content: unknown): UserMessage["content"] {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) {
        invalidRequest(
            "User message content must be text or an array",
            "input",
        );
    }
    return content.map((raw) => {
        const part = objectValue(raw, "input");
        const providerOptions = promptCacheProviderOptions(part);
        if (part.type === "input_text" || part.type === "text") {
            return {
                type: "text" as const,
                text: stringValue(part.text, "input"),
                ...(providerOptions ? { providerOptions } : {}),
            };
        }
        if (part.type === "input_image") {
            return {
                type: "image" as const,
                image: stringValue(part.image_url, "input"),
                ...(providerOptions ? { providerOptions } : {}),
            };
        }
        return invalidRequest(
            `Unsupported user content part: ${String(part.type)}`,
            "input",
        );
    }) as UserMessage["content"];
}

function inputMessages(request: CreateResponseRequest): ModelMessage[] {
    const messages: ModelMessage[] = [];
    if (request.instructions) {
        messages.push({ role: "system", content: request.instructions });
    }
    if (typeof request.input === "string") {
        messages.push({ role: "user", content: request.input });
        return messages;
    }

    for (const raw of request.input) {
        const item = objectValue(raw, "input");
        if (item.type && item.type !== "message") {
            invalidRequest(
                `Unsupported Responses input item: ${String(item.type)}`,
                "input",
            );
        }
        const role = stringValue(item.role, "input");
        if (role === "developer" || role === "system") {
            const { content, providerOptions } = textContent(
                item.content,
                role,
            );
            messages.push({
                role: "system",
                content,
                ...(providerOptions ? { providerOptions } : {}),
            });
            continue;
        }
        if (role === "user") {
            messages.push({ role: "user", content: userContent(item.content) });
            continue;
        }
        if (role === "assistant") {
            const { content, providerOptions } = textContent(
                item.content,
                role,
            );
            messages.push({
                role: "assistant",
                content,
                ...(providerOptions ? { providerOptions } : {}),
            });
            continue;
        }
        invalidRequest(`Unsupported Responses message role: ${role}`, "input");
    }
    return messages;
}

function requestSettings(
    request: CreateResponseRequest,
): PromptAgentGenerationSettings {
    if (request.max_tool_calls != null) {
        invalidRequest(
            "Per-request tool-call limits are not supported by managed agents",
            "max_tool_calls",
        );
    }
    if (
        request.reasoning &&
        Object.keys(request.reasoning).some((key) => key !== "effort")
    ) {
        invalidRequest(
            "Only reasoning effort is supported by managed agents",
            "reasoning",
        );
    }
    const reasoningEffort = request.reasoning?.effort;
    if (
        reasoningEffort != null &&
        !["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(
            String(reasoningEffort),
        )
    ) {
        invalidRequest("Invalid reasoning effort", "reasoning.effort");
    }
    if (request.tools?.length) {
        invalidRequest(
            "Caller-provided tools are not supported by managed agents",
            "tools",
        );
    }
    if (request.tool_choice !== undefined) {
        invalidRequest(
            "Caller-provided tool choice is not supported by managed agents",
            "tool_choice",
        );
    }
    if (request.parallel_tool_calls === false) {
        invalidRequest(
            "Disabling parallel tool calls is not supported by managed agents",
            "parallel_tool_calls",
        );
    }
    if (request.text !== undefined) {
        invalidRequest(
            "Structured text output is not supported by managed agents",
            "text",
        );
    }
    if (request.include?.length) {
        invalidRequest(
            "Additional included output is not supported by managed agents",
            "include",
        );
    }
    if ((request.top_logprobs ?? 0) > 0) {
        invalidRequest("Log probabilities are not supported", "top_logprobs");
    }
    if (request.truncation === "auto") {
        invalidRequest("Automatic truncation is not supported", "truncation");
    }
    if (request.stream_options?.include_obfuscation === true) {
        invalidRequest(
            "Stream obfuscation is not supported by managed agents",
            "stream_options.include_obfuscation",
        );
    }

    const inputHasPromptCacheBreakpoint = hasPromptCacheBreakpoint(
        request.input,
    );
    const promptCacheOptions =
        request.prompt_cache_options ??
        (inputHasPromptCacheBreakpoint ? { mode: "explicit" as const } : null);
    const providerOptions = {
        ...(reasoningEffort ? { reasoningEffort } : {}),
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
    };
    return {
        promptCacheBreakpoint:
            promptCacheOptions?.mode === "explicit" &&
            !inputHasPromptCacheBreakpoint,
        ...(request.max_output_tokens
            ? { maxOutputTokens: request.max_output_tokens }
            : {}),
        ...(request.temperature == null
            ? {}
            : { temperature: request.temperature }),
        ...(request.top_p == null ? {} : { topP: request.top_p }),
        ...(request.frequency_penalty == null
            ? {}
            : { frequencyPenalty: request.frequency_penalty }),
        ...(request.presence_penalty == null
            ? {}
            : { presencePenalty: request.presence_penalty }),
        ...(Object.keys(providerOptions).length
            ? { providerOptions: { pollinations: providerOptions } }
            : {}),
    };
}

function responseUsage(output: AgentOutput): ResponseUsage {
    const usage = buildUsage(output.usage, output.toolCallCounts);
    return ResponseUsageSchema.parse({
        input_tokens: usage.prompt_tokens,
        input_tokens_details: {
            ...usage.prompt_tokens_details,
            cached_tokens: usage.prompt_tokens_details.cached_tokens ?? 0,
            cache_write_tokens:
                usage.prompt_tokens_details.cache_write_tokens ?? 0,
        },
        output_tokens: usage.completion_tokens,
        output_tokens_details: {
            ...usage.completion_tokens_details,
            reasoning_tokens:
                usage.completion_tokens_details.reasoning_tokens ?? 0,
        },
        total_tokens: usage.total_tokens,
        tool_call_counts: usage.tool_call_counts,
    });
}

function responseConfiguration(request: CreateResponseRequest) {
    const reasoning = request.reasoning
        ? {
              effort:
                  typeof request.reasoning.effort === "string"
                      ? request.reasoning.effort
                      : null,
              summary:
                  typeof request.reasoning.summary === "string"
                      ? request.reasoning.summary
                      : null,
          }
        : null;
    return {
        previous_response_id: null,
        instructions: request.instructions ?? null,
        tools: [],
        tool_choice: "auto",
        truncation: "disabled",
        parallel_tool_calls: true,
        text: { format: { type: "text" } },
        top_p: request.top_p ?? 1,
        presence_penalty: request.presence_penalty ?? 0,
        frequency_penalty: request.frequency_penalty ?? 0,
        top_logprobs: request.top_logprobs ?? 0,
        temperature: request.temperature ?? 1,
        reasoning,
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

function responseObject(
    request: CreateResponseRequest,
    output: AgentOutput,
    id: string,
    createdAt: number,
    messageId: string,
) {
    const incomplete =
        output.finishReason === "length" ||
        output.finishReason === "content_filter";
    const response = {
        id,
        object: "response" as const,
        created_at: createdAt,
        completed_at: Math.floor(Date.now() / 1000),
        status: incomplete ? ("incomplete" as const) : ("completed" as const),
        incomplete_details: incomplete
            ? {
                  reason:
                      output.finishReason === "content_filter"
                          ? "content_filter"
                          : "max_output_tokens",
              }
            : null,
        model: request.model,
        output: [
            {
                id: messageId,
                type: "message" as const,
                status: incomplete ? "incomplete" : "completed",
                role: "assistant" as const,
                content: [
                    {
                        type: "output_text" as const,
                        text: output.content,
                        annotations: [],
                        logprobs: [],
                    },
                ],
            },
        ],
        error: null,
        usage: responseUsage(output),
        ...responseConfiguration(request),
    };
    CreateResponseResponseSchema.parse(response);
    return response;
}

function errorResponse(error: unknown): Response {
    const invalid = error instanceof AgentResponsesRequestError;
    const upstreamStatus = APICallError.isInstance(error)
        ? error.statusCode
        : undefined;
    const status = invalid
        ? 400
        : upstreamStatus && upstreamStatus >= 400
          ? upstreamStatus
          : 502;
    return Response.json(
        {
            error: {
                message: error instanceof Error ? error.message : String(error),
                type: invalid ? "invalid_request_error" : "server_error",
                code: invalid ? "unsupported_parameter" : "agent_error",
                param: invalid ? error.param : null,
            },
        },
        { status },
    );
}

function streamResponse(
    request: CreateResponseRequest,
    runtime: PromptAgentRuntime,
    messages: ModelMessage[],
    settings: PromptAgentGenerationSettings,
    signal: AbortSignal,
): Response {
    const encoder = new TextEncoder();
    const responseId = `resp_${crypto.randomUUID()}`;
    const messageId = `msg_${crypto.randomUUID()}`;
    const createdAt = Math.floor(Date.now() / 1000);
    let sequenceNumber = 0;
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (type: string, payload: JsonObject) => {
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
            const initialResponse = {
                id: responseId,
                object: "response",
                created_at: createdAt,
                completed_at: null,
                status: "in_progress",
                incomplete_details: null,
                model: request.model,
                output: [],
                error: null,
                usage: null,
                ...responseConfiguration(request),
            };
            const initialItem = {
                id: messageId,
                type: "message",
                status: "in_progress",
                role: "assistant",
                content: [],
            };
            const initialPart = {
                type: "output_text",
                text: "",
                annotations: [],
                logprobs: [],
            };
            try {
                send("response.created", { response: initialResponse });
                send("response.output_item.added", {
                    output_index: 0,
                    item: initialItem,
                });
                send("response.content_part.added", {
                    item_id: messageId,
                    output_index: 0,
                    content_index: 0,
                    part: initialPart,
                });
                const output = await streamPromptAgent(
                    runtime,
                    messages,
                    signal,
                    (delta) =>
                        send("response.output_text.delta", {
                            item_id: messageId,
                            output_index: 0,
                            content_index: 0,
                            delta,
                            logprobs: [],
                        }),
                    settings,
                );
                const response = responseObject(
                    request,
                    output,
                    responseId,
                    createdAt,
                    messageId,
                );
                const item = response.output[0];
                const part = item.content[0];
                send("response.output_text.done", {
                    item_id: messageId,
                    output_index: 0,
                    content_index: 0,
                    text: output.content,
                    logprobs: [],
                });
                send("response.content_part.done", {
                    item_id: messageId,
                    output_index: 0,
                    content_index: 0,
                    part,
                });
                send("response.output_item.done", {
                    output_index: 0,
                    item,
                });
                send(
                    response.status === "incomplete"
                        ? "response.incomplete"
                        : "response.completed",
                    { response },
                );
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                const responseError = {
                    type: "server_error",
                    code: "agent_error",
                    message,
                    param: null,
                };
                send("error", {
                    error: responseError,
                });
                send("response.failed", {
                    response: {
                        id: responseId,
                        object: "response",
                        created_at: createdAt,
                        completed_at: Math.floor(Date.now() / 1000),
                        status: "failed",
                        incomplete_details: null,
                        model: request.model,
                        output: [],
                        error: responseError,
                        usage: null,
                        ...responseConfiguration(request),
                    },
                });
            } finally {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
            }
        },
    });
    return new Response(stream, {
        headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
            connection: "keep-alive",
        },
    });
}

export async function handlePromptAgentResponsesRequest(
    request: PromptAgentResponsesRequest,
    signal: AbortSignal,
    runtime: PromptAgentRuntime,
): Promise<Response> {
    try {
        const messages = inputMessages(request);
        const settings = requestSettings(request);
        if (request.stream) {
            return streamResponse(request, runtime, messages, settings, signal);
        }
        const output = await runPromptAgent(
            runtime,
            messages,
            signal,
            settings,
        );
        return Response.json(
            responseObject(
                request,
                output,
                `resp_${crypto.randomUUID()}`,
                Math.floor(Date.now() / 1000),
                `msg_${crypto.randomUUID()}`,
            ),
        );
    } catch (error) {
        return errorResponse(error);
    }
}
