import {
    APICallError,
    type ModelMessage,
    type ToolCallPart,
    type ToolResultPart,
    type ToolSet,
} from "ai";
import { z } from "zod";
import { communityEndpointErrorDetail } from "../community-endpoints.ts";
import {
    type CreateResponseRequest,
    CreateResponseResponseSchema,
    type ResponseUsage,
    ResponseUsageSchema,
} from "../schemas/openai.ts";
import {
    functionOutputText,
    type ResponseFunctionCall,
    ResponseFunctionCallOutputSchema,
    ResponseFunctionCallSchema,
} from "../schemas/response-function-items.ts";
import { parseFunctionName } from "./function-items.ts";
import { safeMcpModelOutput } from "./mcp-output.ts";
import { type AgentOutputItem, collectOutput } from "./output.ts";
import type {
    AgentGenerationSettings,
    AgentOutput,
    AgentRunner,
} from "./types.ts";
import { buildUsage } from "./usage.ts";

type JsonObject = Record<string, unknown>;
type UserMessage = Extract<ModelMessage, { role: "user" }>;
type PromptCacheProviderOptions = {
    openaiCompatible: {
        prompt_cache_breakpoint: { mode: "explicit" };
    };
};

// collectOutput serializes executed tool failures in this shape.
const ToolErrorOutputSchema = z.object({
    isError: z.literal(true),
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
});

export class AgentResponsesRequestError extends Error {
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

async function inputMessages(
    request: CreateResponseRequest,
    tools?: ToolSet,
): Promise<ModelMessage[]> {
    const messages: ModelMessage[] = [];
    if (request.instructions) {
        messages.push({ role: "system", content: request.instructions });
    }
    if (typeof request.input === "string") {
        messages.push({ role: "user", content: request.input });
        return messages;
    }

    const itemIds = new Set<string>();
    const toolCallIds = new Set<string>();
    const pendingCalls = new Map<string, ResponseFunctionCall>();
    let calls: ToolCallPart[] = [];
    let results: ToolResultPart[] = [];
    for (const raw of request.input) {
        const item = objectValue(raw, "input");
        if (item.id !== undefined) {
            const id = stringValue(item.id, "input.id");
            if (!id || itemIds.has(id)) {
                invalidRequest(
                    "Responses history item IDs must be unique",
                    "input.id",
                );
            }
            itemIds.add(id);
        }
        if (item.type === "function_call") {
            // Input items carry optional id and status, unlike the items the
            // agent emits: Open WebUI strips both when it replays history.
            const parsed = ResponseFunctionCallSchema.safeParse(item);
            if (
                !parsed.success ||
                (parsed.data.status ?? "completed") !== "completed" ||
                toolCallIds.has(parsed.data.call_id)
            ) {
                invalidRequest(
                    "Tool history must contain unique completed function calls",
                    "input",
                );
            }
            const call = parsed.data;
            toolCallIds.add(call.call_id);
            let input: JsonObject;
            try {
                input = objectValue(
                    JSON.parse(call.arguments),
                    "input.arguments",
                );
            } catch {
                invalidRequest(
                    "Function call arguments must be a JSON object",
                    "input.arguments",
                );
            }
            if (!pendingCalls.size) {
                calls = [];
                results = [];
                messages.push({ role: "assistant", content: calls });
                messages.push({ role: "tool", content: results });
            }
            pendingCalls.set(call.call_id, call);
            calls.push({
                type: "tool-call",
                toolCallId: call.call_id,
                toolName: call.name,
                input,
            });
            continue;
        }
        if (item.type === "function_call_output") {
            const parsed = ResponseFunctionCallOutputSchema.safeParse(item);
            const call = parsed.success
                ? pendingCalls.get(parsed.data.call_id)
                : undefined;
            if (
                !parsed.success ||
                (parsed.data.status ?? "completed") !== "completed" ||
                !call
            ) {
                invalidRequest(
                    "Function outputs must match an unfinished history call",
                    "input",
                );
            }
            const isMcp = Boolean(parseFunctionName(call.name));
            let output: z.infer<ReturnType<typeof z.json>>;
            try {
                output = z
                    .json()
                    .parse(JSON.parse(functionOutputText(parsed.data.output)));
                if (isMcp) {
                    const result = objectValue(output, "input.output");
                    if (
                        !Array.isArray(result.content) ||
                        (result.isError !== undefined &&
                            typeof result.isError !== "boolean")
                    ) {
                        throw new Error("Invalid MCP result");
                    }
                }
            } catch {
                invalidRequest(
                    isMcp
                        ? "Function output must contain a JSON MCP result"
                        : "Function output must contain JSON",
                    "input.output",
                );
            }
            let modelOutput: ToolResultPart["output"] =
                typeof output === "string"
                    ? { type: "text", value: output }
                    : { type: "json", value: output };
            const toModelOutput = tools?.[call.name]?.toModelOutput;
            const toolError = ToolErrorOutputSchema.safeParse(output);
            if (isMcp) {
                modelOutput = safeMcpModelOutput({ output });
            } else if (toolError.success) {
                // Like the SDK, bypass the successful-output formatter on errors.
                modelOutput = {
                    type: "error-text",
                    value: toolError.data.content
                        .map((part) => part.text)
                        .join("\n"),
                };
            } else if (toModelOutput) {
                modelOutput = await toModelOutput({
                    toolCallId: call.call_id,
                    input: JSON.parse(call.arguments),
                    output,
                });
            }
            results.push({
                type: "tool-result",
                toolCallId: call.call_id,
                toolName: call.name,
                output: modelOutput,
            });
            pendingCalls.delete(call.call_id);
            continue;
        }
        if (pendingCalls.size) {
            invalidRequest(
                "Function calls require results before the next message",
                "input",
            );
        }
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
    if (pendingCalls.size) {
        invalidRequest("Function calls require matching results", "input");
    }
    return messages;
}

function requestSettings(
    request: CreateResponseRequest,
): AgentGenerationSettings {
    if (request.max_tool_calls != null) {
        invalidRequest(
            "Per-request tool-call limits are not supported by managed agents",
            "max_tool_calls",
        );
    }
    if (
        request.reasoning &&
        Object.keys(request.reasoning).some(
            (key) => key !== "effort" && key !== "summary",
        )
    ) {
        invalidRequest(
            "Only reasoning effort is supported by managed agents",
            "reasoning",
        );
    }
    if (request.reasoning?.summary != null) {
        invalidRequest(
            "Reasoning summaries are not supported by managed agents",
            "reasoning.summary",
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
    // Caller tools are ignored, not rejected: an agent runs its own tools, and
    // clients attach theirs unprompted. Open WebUI injects builtin tool specs
    // into every chat sent from its UI, so rejecting made agents unusable there.
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
              summary: null,
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
    items: AgentOutputItem[],
) {
    const incomplete =
        output.finishReason === "length" ||
        output.finishReason === "content_filter";
    const response = {
        id,
        object: "response" as const,
        created_at: createdAt,
        completed_at: incomplete ? null : Math.floor(Date.now() / 1000),
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
        output: items,
        error: null,
        usage: responseUsage(output),
        ...responseConfiguration(request),
    };
    CreateResponseResponseSchema.parse(response);
    return response;
}

function errorMessage(error: unknown): string {
    const message =
        typeof error === "string" ? error : communityEndpointErrorDetail(error);
    return message?.trim() ? message : "Agent request failed";
}

export function agentResponsesError(error: unknown): Response {
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
                message: errorMessage(error),
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
    runner: AgentRunner,
    messages: ModelMessage[],
    settings: AgentGenerationSettings,
    signal: AbortSignal,
): Response {
    const encoder = new TextEncoder();
    const responseId = `resp_${crypto.randomUUID()}`;
    const createdAt = Math.floor(Date.now() / 1000);
    const cancellation = new AbortController();
    const runSignal = AbortSignal.any([signal, cancellation.signal]);
    let sequenceNumber = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const send = (type: string, payload: JsonObject) => {
                if (cancelled) return;
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
            const collected = collectOutput(send);
            // Do not block stream initialization on the run: cancel() must
            // abort an in-flight model/tool call, not wait for it to finish.
            void (async () => {
                try {
                    send("response.created", { response: initialResponse });
                    const output = await runner({
                        messages,
                        settings,
                        signal: runSignal,
                        stream: true,
                        onPart: collected.onPart,
                    });
                    if (cancelled) return;
                    runSignal.throwIfAborted();
                    const response = responseObject(
                        request,
                        output,
                        responseId,
                        createdAt,
                        collected.finish(output.finishReason),
                    );
                    send(
                        response.status === "incomplete"
                            ? "response.incomplete"
                            : "response.completed",
                        { response },
                    );
                } catch (error) {
                    if (cancelled) return;
                    const message = errorMessage(error);
                    const responseError = { code: "agent_error", message };
                    send("error", { ...responseError, param: null });
                    send("response.failed", {
                        response: {
                            ...initialResponse,
                            status: "failed",
                            output: collected.items,
                            error: responseError,
                        },
                    });
                } finally {
                    if (!cancelled) {
                        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                        controller.close();
                    }
                }
            })();
        },
        cancel(reason) {
            cancelled = true;
            cancellation.abort(reason);
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

export async function handleAgentResponsesRequest(
    request: CreateResponseRequest,
    signal: AbortSignal,
    runner: AgentRunner,
    tools?: ToolSet,
): Promise<Response> {
    try {
        signal.throwIfAborted();
        const messages = await inputMessages(request, tools);
        signal.throwIfAborted();
        const settings = requestSettings(request);
        if (request.stream) {
            return streamResponse(request, runner, messages, settings, signal);
        }
        const collected = collectOutput();
        const output = await runner({
            messages,
            settings,
            signal,
            stream: false,
            onPart: collected.onPart,
        });
        signal.throwIfAborted();
        return Response.json(
            responseObject(
                request,
                output,
                `resp_${crypto.randomUUID()}`,
                Math.floor(Date.now() / 1000),
                collected.finish(output.finishReason),
            ),
        );
    } catch (error) {
        return agentResponsesError(error);
    }
}
