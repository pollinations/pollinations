import { type CallToolResult, createMCPClient } from "@ai-sdk/mcp";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getLogger } from "@logtape/logtape";
import type { McpServerId } from "@shared/registry/mcp.ts";
import {
    APICallError,
    type FinishReason,
    type ModelMessage,
    stepCountIs,
    ToolLoopAgent,
} from "ai";
import { z } from "zod";
import type { PromptAgentConfig } from "./prompt-agent.ts";

const log = getLogger(["enter", "prompt-agent-runtime"]);

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const PromptAgentRequestSchema = z
    .object({
        // z.custom() accepts the same inputs, but cannot be represented in the
        // OpenAPI JSON Schema generated for the account service.
        messages: z.array(z.unknown()).optional().default([]),
        stream: z.boolean().optional().default(false),
    })
    .passthrough();

export const PromptAgentRuntimeRequestSchema = PromptAgentRequestSchema.extend({
    model: z.string().uuid(),
});

export type PromptAgentRequest = z.output<typeof PromptAgentRequestSchema>;

// Request schema for the agent Responses endpoint.
// Extends the shared CreateResponseRequestSchema but requires a UUID model.
export const AgentResponsesRequestSchema = z
    .object({
        model: z.string().uuid(),
        input: z.union([z.string(), z.array(z.unknown()).min(1)]),
        instructions: z.string().nullish(),
        stream: z.boolean().optional().default(false),
        store: z.literal(false).optional().default(false),
        previous_response_id: z.null().optional(),
        conversation: z.null().optional(),
        background: z.literal(false).nullish(),
        temperature: z.number().min(0).max(2).nullish(),
        top_p: z.number().min(0).max(1).nullish(),
        max_output_tokens: z.number().int().positive().nullish(),
        metadata: z.record(z.string(), z.string()).optional(),
        user: z.string().optional(),
        // Request-supplied tools are not accepted for managed agents.
        // The tool list is fully server-managed via mcpServers config.
    })
    .passthrough();

export type AgentResponsesRequest = z.output<
    typeof AgentResponsesRequestSchema
>;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type PromptAgentRuntime = {
    config: PromptAgentConfig;
    apiKey: string;
    genBaseUrl: string;
};

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;
type McpTool = Awaited<ReturnType<McpClient["tools"]>>[string];
type ToolCallCounts = Record<string, number>;

type AgentUsage = {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
};

type AgentOutput = {
    content: string;
    finishReason: string;
    usage: AgentUsage;
    toolCallCounts: ToolCallCounts;
    steps: unknown[];
};

// ---------------------------------------------------------------------------
// Shared internal event type — both serializers consume this.
// Refactored per issue #14243: "Refactor the agent result/event stream once,
// serialize twice." The ToolLoopAgent loop is NOT forked; only serialization
// differs between Chat Completions and Responses output shapes.
// ---------------------------------------------------------------------------

type TextDeltaEvent = {
    type: "text-delta";
    text: string;
};

type ToolResultEvent = {
    type: "tool-result";
    toolCallId: string;
    toolName: string;
    input: unknown;
    output: unknown;
};

type ToolErrorEvent = {
    type: "tool-error";
    toolCallId: string;
    toolName: string;
    input: unknown;
    error: unknown;
};

type AgentFinishedEvent = {
    type: "agent-finished";
    finishReason: FinishReason;
    usage: AgentUsage;
    stepCount: number;
    toolCallCounts: ToolCallCounts;
};

type AgentEvent =
    | TextDeltaEvent
    | ToolResultEvent
    | ToolErrorEvent
    | AgentFinishedEvent;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STEPS = 8;
const MAX_TOOL_CALLS = 16;
const MCP_INITIALIZATION_TIMEOUT_MS = 15_000;
const STEP_LIMIT_MESSAGE =
    "The agent reached its maximum number of tool-use steps without a final answer.";

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

function agentErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function agentErrorResponse(error: unknown): Response {
    return Response.json(
        { error: { message: agentErrorMessage(error) } },
        {
            status:
                APICallError.isInstance(error) && error.statusCode
                    ? error.statusCode
                    : 502,
        },
    );
}

/**
 * Stateless field rejection for the managed-agent Responses endpoint.
 * Matches the ResponsesInvalidRequestError shape from #14239 exactly so
 * clients get the same error format across both routes.
 */
export class AgentResponsesInvalidRequestError extends Error {
    readonly details: {
        error: {
            message: string;
            type: "invalid_request_error";
            code: "unsupported_parameter";
            param: string | null;
        };
    };

    constructor(message: string, param: string | null = null) {
        super(message);
        this.details = {
            error: {
                message,
                type: "invalid_request_error",
                code: "unsupported_parameter",
                param,
            },
        };
    }
}

function validateAgentResponsesRequest(body: AgentResponsesRequest): void {
    // store, previous_response_id, conversation, background are already
    // constrained by the Zod schema to their inert-default values only.
    // These explicit checks provide clearer error messages for anything
    // that slips through (e.g. unknown passthrough fields).
    const raw = body as Record<string, unknown>;

    if (raw.store === true) {
        throw new AgentResponsesInvalidRequestError(
            "Response storage is not supported on the stateless managed-agent Responses endpoint",
            "store",
        );
    }
    if (
        raw.previous_response_id !== null &&
        raw.previous_response_id !== undefined
    ) {
        throw new AgentResponsesInvalidRequestError(
            "Stateful continuation via previous_response_id is not supported on the stateless managed-agent Responses endpoint",
            "previous_response_id",
        );
    }
    if (raw.conversation !== null && raw.conversation !== undefined) {
        throw new AgentResponsesInvalidRequestError(
            "Conversation context is not supported on the stateless managed-agent Responses endpoint",
            "conversation",
        );
    }
    if (raw.background === true) {
        throw new AgentResponsesInvalidRequestError(
            "Background execution is not supported on the stateless managed-agent Responses endpoint",
            "background",
        );
    }
    // Reject request-supplied MCP or function tools — tool list is server-managed.
    if (Array.isArray(raw.tools) && (raw.tools as unknown[]).length > 0) {
        throw new AgentResponsesInvalidRequestError(
            "Request-supplied tools are not accepted for managed prompt agents; the tool list is fully server-managed",
            "tools",
        );
    }
    // Reject encrypted or reusable state in input items.
    const pending: unknown[] = [body.input];
    while (pending.length > 0) {
        const value = pending.pop();
        if (Array.isArray(value)) {
            pending.push(...value);
            continue;
        }
        if (!value || typeof value !== "object") continue;
        const item = value as Record<string, unknown>;
        if ("encrypted_content" in item || item.type === "item_reference") {
            throw new AgentResponsesInvalidRequestError(
                "Encrypted or reusable response state is not supported by the stateless managed-agent Responses endpoint",
                "input",
            );
        }
        pending.push(...Object.values(item));
    }
}

// ---------------------------------------------------------------------------
// MCP / agent setup (unchanged from pre-refactor)
// ---------------------------------------------------------------------------

async function loadMcpTools(
    serverId: McpServerId,
    url: string,
    apiKey: string,
    signal: AbortSignal,
): Promise<{
    tools: Record<string, McpTool>;
    close: () => Promise<void>;
}> {
    let client: McpClient | undefined;
    const tools: Record<string, McpTool> = {};
    let closed = false;

    const close = async () => {
        if (closed) return;
        closed = true;
        await client?.close();
    };

    try {
        client = await createMCPClient({
            clientName: `pollinations-prompt-agent-${serverId}`,
            initializationOptions: {
                signal,
                timeout: MCP_INITIALIZATION_TIMEOUT_MS,
            },
            transport: {
                type: "http",
                url,
                headers: { Authorization: `Bearer ${apiKey}` },
                // The MCP client asks for redirect "error", which workerd does
                // not support. Use a valid fetch mode for the hosted endpoint.
                fetch: async (input, init) =>
                    globalThis.fetch.call(globalThis, input, {
                        ...init,
                        redirect: "follow",
                    }),
            },
        });
        for (const [name, definition] of Object.entries(await client.tools())) {
            tools[`mcp__${serverId}__${name}`] = definition;
        }
        log.info("MCP_SERVER_LOADED: name={name} url={url} tools={tools}", {
            name: serverId,
            url,
            tools: Object.keys(tools).length,
        });
    } catch (error) {
        // Tool availability is recoverable; the base model can still answer.
        log.error("MCP_SERVER_FAILED: name={name} url={url} error={error}", {
            name: serverId,
            url,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return { tools, close };
}

async function createAgent(
    runtime: PromptAgentRuntime,
    signal: AbortSignal,
    systemMessage?: string,
) {
    const genBaseUrl = runtime.genBaseUrl.replace(/\/$/, "");
    const loadedServers = await Promise.all(
        runtime.config.mcpServers.map((serverId) =>
            loadMcpTools(
                serverId,
                `${genBaseUrl}/mcp/${serverId}`,
                runtime.apiKey,
                signal,
            ),
        ),
    );
    const tools: Record<string, McpTool> = {};
    for (const server of loadedServers) {
        Object.assign(tools, server.tools);
    }
    const close = async () => {
        await Promise.all(loadedServers.map((server) => server.close()));
    };
    const toolCallCounts: ToolCallCounts = {};
    let toolCalls = 0;
    for (const [name, tool] of Object.entries(tools)) {
        const execute = tool.execute;
        tools[name] = {
            ...tool,
            toModelOutput: safeMcpModelOutput,
            execute(input, options) {
                toolCalls += 1;
                toolCallCounts.mcp_call = toolCalls;
                if (toolCalls > MAX_TOOL_CALLS) {
                    throw new Error(
                        `Agent exceeded the maximum of ${MAX_TOOL_CALLS} tool calls`,
                    );
                }
                return execute(input, options);
            },
        };
    }
    const pollinations = createOpenAICompatible({
        name: "pollinations",
        apiKey: runtime.apiKey,
        baseURL: `${genBaseUrl}/v1`,
    });

    const agent = new ToolLoopAgent({
        model: pollinations(runtime.config.baseModel),
        instructions: systemMessage
            ? `${runtime.config.systemPrompt}\n\n${systemMessage}`
            : runtime.config.systemPrompt,
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
        // Model calls spend the caller's balance, so do not retry billed calls.
        maxRetries: 0,
    });

    return { agent, close, toolCallCounts };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openAIFinishReason(reason: FinishReason): string {
    if (reason === "tool-calls") return "tool_calls";
    if (reason === "content-filter") return "content_filter";
    if (reason === "stop" || reason === "length") return reason;
    return "stop";
}

function hitStepLimit(reason: FinishReason, stepCount: number): boolean {
    return reason === "tool-calls" && stepCount >= MAX_STEPS;
}

function buildUsage(usage: AgentUsage, toolCallCounts: ToolCallCounts) {
    const promptTokens = usage.inputTokens ?? 0;
    const completionTokens = usage.outputTokens ?? 0;
    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: usage.totalTokens ?? promptTokens + completionTokens,
        tool_call_counts: toolCallCounts,
    };
}

function contentChunk(
    id: string,
    created: number,
    model: string,
    content: string,
) {
    return {
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
            {
                index: 0,
                delta: { role: "assistant", content },
                finish_reason: null,
            },
        ],
    };
}

function safeMcpModelOutput({ output }: { output: unknown }) {
    const result = output as CallToolResult;
    if (!result?.content || !Array.isArray(result.content)) {
        return {
            type: "text" as const,
            value: "Tool completed without text or linked output.",
        };
    }

    const value: Array<{ type: "text"; text: string }> = [];
    for (const part of result.content) {
        if (part.type === "text") {
            value.push({ type: "text", text: part.text });
            continue;
        }
        if (part.type === "resource_link") {
            value.push({
                type: "text",
                text: JSON.stringify({
                    type: part.type,
                    uri: part.uri,
                    name: part.name,
                    description: part.description,
                    mimeType: part.mimeType,
                }),
            });
            continue;
        }
        if (part.type === "resource" && "text" in part.resource) {
            value.push({ type: "text", text: part.resource.text });
            continue;
        }
        value.push({
            type: "text",
            text: `[${part.type} output omitted; use an HTTPS resource link]`,
        });
    }

    return value.length > 0
        ? { type: "content" as const, value }
        : {
              type: "text" as const,
              value: "Tool completed without text or linked output.",
          };
}

function escapeHtml(value: string): string {
    return value.replace(
        /[&<>"']/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[character] ?? character,
    );
}

function toolOutputText(output: unknown): string {
    const modelOutput = safeMcpModelOutput({ output });
    return modelOutput.type === "text"
        ? modelOutput.value
        : modelOutput.value.map((part) => part.text).join("\n");
}

function mediaResultContent(
    toolName: string,
    output: unknown,
    seenUrls: Set<string>,
    hasContent: boolean,
): string {
    const result = output as CallToolResult;
    if (
        !result ||
        typeof result !== "object" ||
        !("content" in result) ||
        !Array.isArray(result.content)
    ) {
        return "";
    }

    const links: string[] = [];
    for (const part of result.content as Array<{
        type: string;
        uri?: string;
        mimeType?: string;
    }>) {
        if (part.type !== "resource_link") continue;
        const knownTool = toolName.startsWith("mcp__pollinations__generate");
        const isMedia =
            part.mimeType?.startsWith("image/") ||
            part.mimeType?.startsWith("audio/") ||
            part.mimeType?.startsWith("video/") ||
            part.mimeType?.startsWith("model/") ||
            knownTool;
        if (!isMedia) continue;

        try {
            if (!part.uri) continue;
            const url = new URL(part.uri);
            if (url.protocol !== "https:" || seenUrls.has(url.href)) continue;
            seenUrls.add(url.href);
            if (
                part.mimeType?.startsWith("image/") ||
                toolName === "mcp__pollinations__generateImage"
            ) {
                links.push(`![Generated image](<${url.href}>)`);
            } else {
                const label = part.mimeType?.startsWith("audio/")
                    ? "Generated audio"
                    : part.mimeType?.startsWith("video/")
                      ? "Generated video"
                      : part.mimeType?.startsWith("model/")
                        ? "Generated 3D model"
                        : "Generated media";
                links.push(`[${label}](<${url.href}>)`);
            }
        } catch {
            // Ignore resource links that cannot be displayed safely.
        }
    }
    if (links.length === 0) return "";
    return `${hasContent ? "\n\n" : ""}${links.join("\n\n")}\n\n`;
}

function toolResultContent(
    part: {
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
    },
    seenUrls: Set<string>,
    hasContent: boolean,
): string {
    const details = toolDetailsContent(
        part,
        "Tool Executed",
        toolOutputText(part.output),
        hasContent,
    );
    const media = mediaResultContent(
        part.toolName,
        part.output,
        seenUrls,
        true,
    );
    return `${details}${media || "\n\n"}`;
}

function toolDetailsContent(
    part: { toolCallId: string; toolName: string; input: unknown },
    summary: string,
    output: string,
    hasContent: boolean,
): string {
    const name = part.toolName.replace(/^mcp__[^_]+__/, "");
    const argumentsJson = JSON.stringify(part.input ?? {});
    return (
        (hasContent ? "\n\n" : "") +
        `<details type="tool_calls" done="true" ` +
        `id="${escapeHtml(part.toolCallId)}" ` +
        `name="${escapeHtml(name)}" ` +
        `arguments="${escapeHtml(argumentsJson)}">\n` +
        `<summary>${summary}</summary>\n` +
        `${escapeHtml(output)}\n` +
        "</details>"
    );
}

// ---------------------------------------------------------------------------
// Non-streaming agent run (unchanged)
// ---------------------------------------------------------------------------

async function runAgent(
    runtime: PromptAgentRuntime,
    messages: ModelMessage[],
    signal: AbortSignal,
): Promise<AgentOutput> {
    const systemMessage = messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n") || undefined;
    const filteredMessages = messages.filter((m) => m.role !== "system");
    const { agent, close, toolCallCounts } = await createAgent(runtime, signal, systemMessage);
    try {
        const result = await agent.generate({
            messages: filteredMessages,
            abortSignal: signal,
        });
        const limited = hitStepLimit(result.finishReason, result.steps.length);
        const seenUrls = new Set<string>();
        let content = "";
        for (const step of result.steps) {
            for (const part of step.content) {
                if (part.type === "text") content += part.text;
                if (part.type === "tool-result") {
                    content += toolResultContent(
                        part,
                        seenUrls,
                        content.length > 0,
                    );
                }
                if (part.type === "tool-error") {
                    content += `${toolDetailsContent(
                        part,
                        "Tool Failed",
                        agentErrorMessage(part.error),
                        content.length > 0,
                    )}\n\n`;
                }
            }
        }
        const finalContent = limited
            ? `${content}\n\n${STEP_LIMIT_MESSAGE}`
            : content;
        if (!finalContent.trim()) throw new Error("Agent produced no response");
        return {
            content: finalContent,
            finishReason: limited
                ? "length"
                : openAIFinishReason(result.finishReason),
            usage: result.usage,
            toolCallCounts,
            steps: result.steps,
        };
    } finally {
        await close();
    }
}

// ---------------------------------------------------------------------------
// Shared internal stream — yields AgentEvent from the ToolLoopAgent stream.
// Both Chat Completions and Responses serializers consume this.
// ---------------------------------------------------------------------------

/**
 * Structural interface for what we actually consume from ToolLoopAgent.stream().
 * Using a structural type avoids the ToolSet generic index-signature mismatch
 * that occurs when passing the result through typed function parameters.
 */
type AgentStreamResult = {
    // Use an open record type for fullStream items to avoid the ToolSet
    // generic index-signature mismatch on StreamTextResult. We narrow to
    // specific shapes inside streamAgentEvents via type assertions.
    fullStream: AsyncIterable<Record<string, unknown>>;
    finishReason: Promise<FinishReason>;
    usage: Promise<AgentUsage>;
    steps: Promise<Array<unknown>>;
};

async function* streamAgentEvents(
    result: AgentStreamResult,
): AsyncGenerator<AgentEvent> {
    for await (const part of result.fullStream) {
        const type = part.type as string;
        if (type === "error") throw part.error;
        if (type === "text-delta") {
            yield { type: "text-delta", text: (part.text as string) ?? "" };
        } else if (type === "tool-result") {
            yield {
                type: "tool-result",
                toolCallId: (part.toolCallId as string) ?? "",
                toolName: (part.toolName as string) ?? "",
                input: part.input,
                output: part.output,
            };
        } else if (type === "tool-error") {
            yield {
                type: "tool-error",
                toolCallId: (part.toolCallId as string) ?? "",
                toolName: (part.toolName as string) ?? "",
                input: part.input,
                error: part.error,
            };
        }
    }
    const [reason, usage, steps] = await Promise.all([
        result.finishReason,
        result.usage,
        result.steps,
    ]);
    yield {
        type: "agent-finished",
        finishReason: reason,
        usage,
        stepCount: steps.length,
        // toolCallCounts is populated by reference in createAgent() via closure
        toolCallCounts: {},
    };
}

// ---------------------------------------------------------------------------
// Chat Completions SSE serializer (preserves exact pre-refactor behavior)
// ---------------------------------------------------------------------------

async function serializeChatStream(
    result: AgentStreamResult,
    toolCallCounts: ToolCallCounts,
    id: string,
    created: number,
    model: string,
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> {
    const send = (payload: unknown) =>
        controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );

    const seenUrls = new Set<string>();
    let hasContent = false;

    for await (const event of streamAgentEvents(result)) {
        if (event.type === "text-delta") {
            hasContent ||= event.text.trim().length > 0;
            send(contentChunk(id, created, model, event.text));
        } else if (event.type === "tool-result") {
            const content = toolResultContent(event, seenUrls, hasContent);
            if (content) {
                hasContent = true;
                send(contentChunk(id, created, model, content));
            }
        } else if (event.type === "tool-error") {
            const content = toolDetailsContent(
                event,
                "Tool Failed",
                agentErrorMessage(event.error),
                hasContent,
            );
            hasContent = true;
            send(contentChunk(id, created, model, `${content}\n\n`));
        } else if (event.type === "agent-finished") {
            const limited = hitStepLimit(event.finishReason, event.stepCount);
            if (limited) {
                send(
                    contentChunk(
                        id,
                        created,
                        model,
                        `\n\n${STEP_LIMIT_MESSAGE}`,
                    ),
                );
            }
            if (!hasContent && !limited) {
                throw new Error("Agent produced no response");
            }
            send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                    {
                        index: 0,
                        delta: {},
                        finish_reason: limited
                            ? "length"
                            : openAIFinishReason(event.finishReason),
                    },
                ],
                usage: buildUsage(event.usage, toolCallCounts),
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
    }
}

// ---------------------------------------------------------------------------
// Responses SSE serializer (new — issue #14243)
// ---------------------------------------------------------------------------

/**
 * Converts AgentUsage to the Responses API ResponseUsage shape.
 */
function agentUsageToResponseUsage(usage: AgentUsage): {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
} {
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    return {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: usage.totalTokens ?? inputTokens + outputTokens,
    };
}

async function serializeResponsesStream(
    result: AgentStreamResult,
    toolCallCounts: ToolCallCounts,
    responseId: string,
    createdAt: number,
    model: string,
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> {
    const sendEvent = (eventType: string, data: unknown) =>
        controller.enqueue(
            encoder.encode(
                `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
        );

    // Per Responses API spec: emit response.created and response.in_progress
    // at the start of the stream.
    sendEvent("response.created", {
        type: "response.created",
        response: {
            id: responseId,
            object: "response",
            created_at: createdAt,
            model,
            status: "in_progress",
        },
    });
    sendEvent("response.in_progress", {
        type: "response.in_progress",
        response: {
            id: responseId,
            object: "response",
            created_at: createdAt,
            model,
            status: "in_progress",
        },
    });

    // Output item index for text output (tool results are separate items).
    let textItemStarted = false;
    let textOutputIndex = 0;
    let nextOutputIndex = 0;
    let hasContent = false;

    for await (const event of streamAgentEvents(result)) {
        if (event.type === "text-delta") {
            hasContent ||= event.text.trim().length > 0;
            if (!textItemStarted) {
                textItemStarted = true;
                textOutputIndex = nextOutputIndex;
                nextOutputIndex += 1;
                sendEvent("response.output_item.added", {
                    type: "response.output_item.added",
                    output_index: textOutputIndex,
                    item: {
                        type: "message",
                        id: `msg_${responseId}`,
                        role: "assistant",
                        content: [],
                        status: "in_progress",
                    },
                });
                sendEvent("response.content_part.added", {
                    type: "response.content_part.added",
                    item_id: `msg_${responseId}`,
                    output_index: textOutputIndex,
                    content_index: 0,
                    part: { type: "output_text", text: "", annotations: [] },
                });
            }
            sendEvent("response.output_text.delta", {
                type: "response.output_text.delta",
                item_id: `msg_${responseId}`,
                output_index: textOutputIndex,
                content_index: 0,
                delta: event.text,
            });
        } else if (event.type === "tool-result") {
            // Emit an inline tool call output item for Responses clients.
            const toolItemIndex = nextOutputIndex;
            nextOutputIndex += 1;
            const toolName = event.toolName.replace(/^mcp__[^_]+__/, "");
            sendEvent("response.output_item.added", {
                type: "response.output_item.added",
                output_index: toolItemIndex,
                item: {
                    type: "function_call",
                    id: event.toolCallId,
                    call_id: event.toolCallId,
                    name: toolName,
                    arguments: JSON.stringify(event.input ?? {}),
                    status: "completed",
                    output: toolOutputText(event.output),
                },
            });
        } else if (event.type === "tool-error") {
            const toolItemIndex = nextOutputIndex;
            nextOutputIndex += 1;
            const toolName = event.toolName.replace(/^mcp__[^_]+__/, "");
            sendEvent("response.output_item.added", {
                type: "response.output_item.added",
                output_index: toolItemIndex,
                item: {
                    type: "function_call",
                    id: event.toolCallId,
                    call_id: event.toolCallId,
                    name: toolName,
                    arguments: JSON.stringify(event.input ?? {}),
                    status: "failed",
                    output: agentErrorMessage(event.error),
                },
            });
        } else if (event.type === "agent-finished") {
            const limited = hitStepLimit(event.finishReason, event.stepCount);
            if (!hasContent && !limited) {
                throw new Error("Agent produced no response");
            }
            if (limited && textItemStarted) {
                // Append the step-limit message to the text stream.
                sendEvent("response.output_text.delta", {
                    type: "response.output_text.delta",
                    item_id: `msg_${responseId}`,
                    output_index: textOutputIndex,
                    content_index: 0,
                    delta: `\n\n${STEP_LIMIT_MESSAGE}`,
                });
            }
            // Close open text output item if present.
            if (textItemStarted) {
                sendEvent("response.content_part.done", {
                    type: "response.content_part.done",
                    item_id: `msg_${responseId}`,
                    output_index: textOutputIndex,
                    content_index: 0,
                    part: { type: "output_text", annotations: [] },
                });
                sendEvent("response.output_item.done", {
                    type: "response.output_item.done",
                    output_index: textOutputIndex,
                    item: {
                        type: "message",
                        id: `msg_${responseId}`,
                        role: "assistant",
                        status: "completed",
                    },
                });
            }

            const responseStatus = limited ? "incomplete" : "completed";
            const terminalEventType = limited
                ? "response.incomplete"
                : "response.completed";
            const responseUsage = agentUsageToResponseUsage(event.usage);

            // The terminal event contains usage — this is the billing gate.
            // If the client disconnects before this event, the AbortSignal
            // aborts the stream and this block is never reached → no billing.
            sendEvent(terminalEventType, {
                type: terminalEventType,
                response: {
                    id: responseId,
                    object: "response",
                    created_at: createdAt,
                    model,
                    status: responseStatus,
                    usage: responseUsage,
                    // tool_call_counts preserved for Tinybird attribution —
                    // parallel to the chat.completion usage.tool_call_counts field.
                    metadata: {
                        tool_call_counts: JSON.stringify(toolCallCounts),
                    },
                },
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Responses JSON serializer (non-streaming, issue #14243)
// ---------------------------------------------------------------------------

function formatResponsesResponse(
    out: AgentOutput,
    responseId: string,
    createdAt: number,
    model: string,
): Record<string, unknown> {
    const responseUsage = agentUsageToResponseUsage(out.usage);
    const status = out.finishReason === "length" ? "incomplete" : "completed";

    const output: Record<string, unknown>[] = [];

    // Map tool calls from steps into the output array for Responses API
    if (out.steps && Array.isArray(out.steps)) {
        for (const step of out.steps) {
            const typedStep = step as any;
            if (Array.isArray(typedStep.toolResults)) {
                for (const tr of typedStep.toolResults) {
                    const toolName = (tr.toolName || "").replace(/^mcp__[^_]+__/, "");
                    
                    let outputText = "";
                    if (typeof tr.output === "string") {
                        outputText = tr.output;
                    } else if (tr.output && typeof tr.output === "object" && Array.isArray(tr.output.content)) {
                        outputText = tr.output.content.map((c: any) => c.text || "").join("");
                    } else if (tr.output && typeof tr.output === "object") {
                        outputText = JSON.stringify(tr.output);
                    } else {
                        outputText = String(tr.output ?? "");
                    }
                    
                    output.push({
                        type: "function_call",
                        id: tr.toolCallId,
                        call_id: tr.toolCallId,
                        name: toolName,
                        arguments: JSON.stringify(tr.args ?? tr.input ?? {}),
                        status: tr.isError ? "failed" : "completed",
                        output: outputText,
                    });
                }
            }
        }
    }

    // Build output array: one message item containing the text content.
    // (Tool calls are embedded in the text as HTML <details> for Chat; for
    // Responses we expose the final combined content as a single output_text.)
    output.push({
        type: "message",
        id: `msg_${responseId}`,
        role: "assistant",
        status: "completed",
        content: [
            {
                type: "output_text",
                text: out.content,
                annotations: [],
            },
        ],
    });

    return {
        id: responseId,
        object: "response",
        created_at: createdAt,
        model,
        status,
        output,
        usage: responseUsage,
        // tool_call_counts preserved for Tinybird attribution.
        metadata: {
            tool_call_counts: JSON.stringify(out.toolCallCounts),
        },
    };
}

// ---------------------------------------------------------------------------
// Responses input adapter
// ---------------------------------------------------------------------------

/**
 * Converts CreateResponseRequest.input (string | unknown[]) to ModelMessage[]
 * for ToolLoopAgent. Handles the common Responses API input formats.
 */
function responsesInputToMessages(
    input: string | unknown[],
    instructions?: string | null,
): ModelMessage[] {
    const messages: ModelMessage[] = [];

    // instructions maps to a system prompt prepended as a system message.
    if (instructions) {
        messages.push({ role: "system", content: instructions });
    }

    if (typeof input === "string") {
        messages.push({ role: "user", content: input });
        return messages;
    }

    // Array input: map each item to a ModelMessage.
    // Supports the common { role, content } shape used by Responses clients.
    for (const item of input) {
        if (!item || typeof item !== "object") continue;
        const entry = item as Record<string, unknown>;
        const role = entry.role as string | undefined;
        const content = entry.content;
        if (!role || content === undefined) continue;

        if (typeof content === "string") {
            messages.push({
                role: role as "user" | "assistant" | "system",
                content,
            });
        } else if (Array.isArray(content)) {
            // Content array: concatenate text parts.
            const text = (content as Array<{ type?: string; text?: string }>)
                .filter(
                    (part) =>
                        part.type === "text" || part.type === "output_text",
                )
                .map((part) => part.text ?? "")
                .join("");
            if (text) {
                messages.push({
                    role: role as "user" | "assistant" | "system",
                    content: text,
                });
            }
        }
    }

    return messages;
}

// ---------------------------------------------------------------------------
// Streaming response builders
// ---------------------------------------------------------------------------

async function streamAgent(
    runtime: PromptAgentRuntime,
    messages: ModelMessage[],
    signal: AbortSignal,
    id: string,
    created: number,
): Promise<Response> {
    const systemMessage = messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n") || undefined;
    const filteredMessages = messages.filter((m) => m.role !== "system");
    const { agent, close, toolCallCounts } = await createAgent(runtime, signal, systemMessage);
    let result: Awaited<ReturnType<typeof agent.stream>>;
    try {
        result = await agent.stream({ messages: filteredMessages, abortSignal: signal });
    } catch (error) {
        await close();
        throw error;
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                await serializeChatStream(
                    result as unknown as AgentStreamResult,
                    toolCallCounts,
                    id,
                    created,
                    runtime.config.baseModel,
                    encoder,
                    controller,
                );
            } catch (error) {
                const content =
                    "\n\n" +
                    '<details type="error" done="true">\n' +
                    "<summary>Agent Failed</summary>\n" +
                    `${escapeHtml(agentErrorMessage(error))}\n` +
                    "</details>";
                const send = (payload: unknown) =>
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
                    );
                send(
                    contentChunk(
                        id,
                        created,
                        runtime.config.baseModel,
                        content,
                    ),
                );
                send({
                    id,
                    object: "chat.completion.chunk",
                    created,
                    model: runtime.config.baseModel,
                    choices: [
                        {
                            index: 0,
                            delta: {},
                            finish_reason: "stop",
                        },
                    ],
                });
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            } finally {
                await close().catch((error) => console.error(error));
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
        },
    });
}

async function streamAgentResponses(
    runtime: PromptAgentRuntime,
    messages: ModelMessage[],
    signal: AbortSignal,
    responseId: string,
    createdAt: number,
): Promise<Response> {
    const systemMessage = messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n") || undefined;
    const filteredMessages = messages.filter((m) => m.role !== "system");
    const { agent, close, toolCallCounts } = await createAgent(runtime, signal, systemMessage);
    let result: Awaited<ReturnType<typeof agent.stream>>;
    try {
        result = await agent.stream({ messages: filteredMessages, abortSignal: signal });
    } catch (error) {
        await close();
        throw error;
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const sendEvent = (eventType: string, data: unknown) =>
                controller.enqueue(
                    encoder.encode(
                        `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`,
                    ),
                );
            try {
                await serializeResponsesStream(
                    result as unknown as AgentStreamResult,
                    toolCallCounts,
                    responseId,
                    createdAt,
                    runtime.config.baseModel,
                    encoder,
                    controller,
                );
            } catch (error) {
                // On agent failure, emit response.failed with no usage so
                // the billing gate is never triggered.
                sendEvent("response.failed", {
                    type: "response.failed",
                    response: {
                        id: responseId,
                        object: "response",
                        created_at: createdAt,
                        model: runtime.config.baseModel,
                        status: "failed",
                        error: {
                            code: "server_error",
                            message: agentErrorMessage(error),
                        },
                    },
                });
            } finally {
                await close().catch((error) => console.error(error));
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
        },
    });
}

// ---------------------------------------------------------------------------
// Public handlers
// ---------------------------------------------------------------------------

export async function handlePromptAgentRequest(
    body: PromptAgentRequest,
    signal: AbortSignal,
    runtime: PromptAgentRuntime,
): Promise<Response> {
    const messages = (
        Array.isArray(body.messages) ? body.messages : []
    ) as ModelMessage[];
    const id = `chatcmpl-${crypto.randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    try {
        if (body.stream) {
            return await streamAgent(runtime, messages, signal, id, created);
        }
        const out = await runAgent(runtime, messages, signal);
        return Response.json({
            id,
            object: "chat.completion",
            created,
            model: runtime.config.baseModel,
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: out.content,
                    },
                    finish_reason: out.finishReason,
                },
            ],
            usage: buildUsage(out.usage, out.toolCallCounts),
        });
    } catch (error) {
        return agentErrorResponse(error);
    }
}

/**
 * Handles POST /agent-runtime/v1/responses — serves managed prompt agents
 * through the OpenAI Responses API shape (issue #14243).
 *
 * Stateless-only: store, previous_response_id, conversation, background,
 * encrypted state, and request-supplied tools are explicitly rejected.
 *
 * The tool loop remains fully server-managed — same MCP servers as the
 * Chat Completions path. Only the output serialization format differs.
 *
 * Billing guarantee: the terminal response.completed/incomplete event (with
 * usage) is only emitted after the stream completes. A client disconnect
 * aborts the signal before this event, so no usage is recorded → no charge.
 */
export async function handleAgentResponsesRequest(
    body: AgentResponsesRequest,
    signal: AbortSignal,
    runtime: PromptAgentRuntime,
): Promise<Response> {
    const responseId = `resp_${crypto.randomUUID().replace(/-/g, "")}`;
    const createdAt = Math.floor(Date.now() / 1000);

    try {
        validateAgentResponsesRequest(body);
    } catch (error) {
        if (error instanceof AgentResponsesInvalidRequestError) {
            return Response.json(error.details, { status: 400 });
        }
        throw error;
    }

    const messages = responsesInputToMessages(body.input, body.instructions);

    try {
        if (body.stream) {
            return await streamAgentResponses(
                runtime,
                messages,
                signal,
                responseId,
                createdAt,
            );
        }
        const out = await runAgent(runtime, messages, signal);
        return Response.json(
            formatResponsesResponse(
                out,
                responseId,
                createdAt,
                runtime.config.baseModel,
            ),
        );
    } catch (error) {
        // Responses API error shape (not Chat Completions shape).
        const message = agentErrorMessage(error);
        const status =
            APICallError.isInstance(error) && error.statusCode
                ? error.statusCode
                : 502;
        return Response.json(
            {
                error: {
                    message,
                    type: "server_error",
                    code: "agent_error",
                    param: null,
                },
            },
            { status },
        );
    }
}
