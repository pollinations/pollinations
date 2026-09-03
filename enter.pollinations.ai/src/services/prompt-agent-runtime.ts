import { type CallToolResult, createMCPClient } from "@ai-sdk/mcp";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getLogger } from "@logtape/logtape";
import type { McpServerId } from "@shared/registry/mcp.ts";
import {
    type CompletionUsage,
    CompletionUsageSchema,
} from "@shared/schemas/openai.ts";
import {
    APICallError,
    type FinishReason,
    type LanguageModelCallOptions,
    type ModelMessage,
    stepCountIs,
    ToolLoopAgent,
    type ToolLoopAgentSettings,
} from "ai";
import { z } from "zod";
import type { PromptAgentConfig } from "./prompt-agent.ts";

const log = getLogger(["enter", "prompt-agent-runtime"]);

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

export type PromptAgentRuntime = {
    config: PromptAgentConfig;
    apiKey: string;
    genBaseUrl: string;
};

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;
type McpTool = Awaited<ReturnType<McpClient["tools"]>>[string];
type ToolCallCounts = Record<string, number>;

export type AgentUsage = {
    inputTokens?: number;
    inputTokenDetails?: {
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    };
    outputTokens?: number;
    outputTokenDetails?: {
        reasoningTokens?: number;
    };
    totalTokens?: number;
};

type AgentStep = {
    providerMetadata?: Record<string, Record<string, unknown>>;
};

export type AgentOutput = {
    content: string;
    finishReason: string;
    usage: AgentUsage;
    toolCallCounts: ToolCallCounts;
};

export type PromptAgentGenerationSettings = Partial<
    Pick<
        LanguageModelCallOptions,
        | "frequencyPenalty"
        | "maxOutputTokens"
        | "presencePenalty"
        | "reasoning"
        | "temperature"
        | "topP"
    >
> & {
    providerOptions?: ToolLoopAgentSettings["providerOptions"];
};

const MAX_STEPS = 8;
const MAX_TOOL_CALLS = 16;
const MCP_INITIALIZATION_TIMEOUT_MS = 15_000;
const STEP_LIMIT_MESSAGE =
    "The agent reached its maximum number of tool-use steps without a final answer.";

function agentErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function agentErrorResponse(error: unknown): Response {
    const upstreamStatus = APICallError.isInstance(error)
        ? error.statusCode
        : undefined;
    return Response.json(
        { error: { message: agentErrorMessage(error) } },
        {
            status:
                upstreamStatus && upstreamStatus >= 400 ? upstreamStatus : 502,
        },
    );
}

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
    settings: PromptAgentGenerationSettings = {},
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
        metadataExtractor: {
            async extractMetadata({ parsedBody }) {
                return {
                    pollinations: {
                        completionUsage: completionUsageFromBody(parsedBody),
                    },
                };
            },
            createStreamExtractor() {
                let usage: CompletionUsage | undefined;
                return {
                    processChunk(chunk) {
                        if (
                            chunk &&
                            typeof chunk === "object" &&
                            "usage" in chunk &&
                            chunk.usage != null
                        ) {
                            usage = completionUsage(chunk.usage);
                        }
                    },
                    buildMetadata() {
                        return {
                            pollinations: { completionUsage: usage ?? null },
                        };
                    },
                };
            },
        },
    });

    const agent = new ToolLoopAgent({
        model: pollinations(runtime.config.baseModel),
        instructions: runtime.config.systemPrompt,
        allowSystemInMessages: true,
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
        ...settings,
        // Model calls spend the caller's balance, so do not retry billed calls.
        maxRetries: 0,
    });

    return { agent, close, toolCallCounts };
}

function openAIFinishReason(reason: FinishReason): string {
    if (reason === "tool-calls") return "tool_calls";
    if (reason === "content-filter") return "content_filter";
    if (reason === "stop" || reason === "length") return reason;
    return "stop";
}

function hitStepLimit(reason: FinishReason, stepCount: number): boolean {
    return reason === "tool-calls" && stepCount >= MAX_STEPS;
}

function tokenCount(value: number | undefined, name: string): number {
    if (!Number.isSafeInteger(value) || (value ?? -1) < 0) {
        throw new Error(`Agent response omitted valid ${name}`);
    }
    return value as number;
}

function completionUsage(value: unknown): CompletionUsage {
    const parsed = CompletionUsageSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error("Agent response omitted valid usage");
    }
    return parsed.data;
}

function completionUsageFromBody(body: unknown): CompletionUsage | null {
    if (!body || typeof body !== "object" || !("usage" in body)) {
        return null;
    }
    return completionUsage(body.usage);
}

function sumUsageField(
    usages: CompletionUsage[],
    value: (usage: CompletionUsage) => number | null | undefined,
): number | undefined {
    let found = false;
    let total = 0;
    for (const usage of usages) {
        const amount = value(usage);
        if (amount == null) continue;
        found = true;
        total += amount;
    }
    return found ? total : undefined;
}

function strictAgentUsage(steps: AgentStep[]): AgentUsage {
    const usages = steps.map((step) => {
        return completionUsage(
            step.providerMetadata?.pollinations?.completionUsage,
        );
    });
    if (usages.length === 0) {
        throw new Error("Agent response omitted valid usage");
    }
    return {
        inputTokens: sumUsageField(usages, (usage) => usage.prompt_tokens),
        inputTokenDetails: {
            cacheReadTokens: sumUsageField(
                usages,
                (usage) => usage.prompt_tokens_details?.cached_tokens,
            ),
            cacheWriteTokens: sumUsageField(
                usages,
                (usage) => usage.prompt_tokens_details?.cache_write_tokens,
            ),
        },
        outputTokens: sumUsageField(usages, (usage) => usage.completion_tokens),
        outputTokenDetails: {
            reasoningTokens: sumUsageField(
                usages,
                (usage) =>
                    usage.completion_tokens_details?.reasoning_tokens ??
                    usage.reasoning_tokens,
            ),
        },
        totalTokens: sumUsageField(usages, (usage) => usage.total_tokens),
    };
}

export function buildUsage(usage: AgentUsage, toolCallCounts: ToolCallCounts) {
    const promptTokens = tokenCount(usage.inputTokens, "input usage");
    const completionTokens = tokenCount(usage.outputTokens, "output usage");
    const totalTokens = usage.totalTokens ?? promptTokens + completionTokens;
    tokenCount(totalTokens, "total usage");
    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        prompt_tokens_details: {
            cached_tokens: usage.inputTokenDetails?.cacheReadTokens ?? null,
            cache_write_tokens:
                usage.inputTokenDetails?.cacheWriteTokens ?? null,
        },
        completion_tokens_details: {
            reasoning_tokens: usage.outputTokenDetails?.reasoningTokens ?? null,
        },
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
    return `\n\n${links.join("\n\n")}\n\n`;
}

function toolResultContent(
    part: {
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
    },
    seenUrls: Set<string>,
): string {
    const details = toolDetailsContent(
        part,
        "Tool Executed",
        toolOutputText(part.output),
    );
    const media = mediaResultContent(part.toolName, part.output, seenUrls);
    return `${details}${media || "\n\n"}`;
}

function toolDetailsContent(
    part: { toolCallId: string; toolName: string; input: unknown },
    summary: string,
    output: string,
): string {
    const name = part.toolName.replace(/^mcp__[^_]+__/, "");
    const argumentsJson = JSON.stringify(part.input ?? {});
    return (
        `\n\n<details type="tool_calls" done="true" ` +
        `id="${escapeHtml(part.toolCallId)}" ` +
        `name="${escapeHtml(name)}" ` +
        `arguments="${escapeHtml(argumentsJson)}">\n` +
        `<summary>${summary}</summary>\n` +
        `${escapeHtml(output)}\n` +
        "</details>"
    );
}

export async function runPromptAgent(
    runtime: PromptAgentRuntime,
    messages: ModelMessage[],
    signal: AbortSignal,
    settings: PromptAgentGenerationSettings = {},
): Promise<AgentOutput> {
    const { agent, close, toolCallCounts } = await createAgent(
        runtime,
        signal,
        settings,
    );
    try {
        const result = await agent.generate({
            messages,
            abortSignal: signal,
        });
        const limited = hitStepLimit(result.finishReason, result.steps.length);
        const seenUrls = new Set<string>();
        let content = "";
        for (const step of result.steps) {
            for (const part of step.content) {
                if (part.type === "text") content += part.text;
                if (part.type === "tool-result") {
                    content += toolResultContent(part, seenUrls);
                }
                if (part.type === "tool-error") {
                    content += `${toolDetailsContent(
                        part,
                        "Tool Failed",
                        agentErrorMessage(part.error),
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
            usage: strictAgentUsage(result.steps),
            toolCallCounts,
        };
    } finally {
        await close();
    }
}

export async function streamPromptAgent(
    runtime: PromptAgentRuntime,
    messages: ModelMessage[],
    signal: AbortSignal,
    onContent: (content: string) => void,
    settings: PromptAgentGenerationSettings = {},
): Promise<AgentOutput> {
    const { agent, close, toolCallCounts } = await createAgent(
        runtime,
        signal,
        settings,
    );
    try {
        const result = await agent.stream({ messages, abortSignal: signal });
        const seenUrls = new Set<string>();
        let content = "";
        for await (const part of result.fullStream) {
            if (part.type === "error") throw part.error;
            let delta = "";
            if (part.type === "text-delta") delta = part.text;
            if (part.type === "tool-result") {
                delta = toolResultContent(part, seenUrls);
            }
            if (part.type === "tool-error") {
                delta = `${toolDetailsContent(
                    part,
                    "Tool Failed",
                    agentErrorMessage(part.error),
                )}\n\n`;
            }
            if (!delta) continue;
            content += delta;
            onContent(delta);
        }
        const [reason, steps] = await Promise.all([
            result.finishReason,
            result.steps,
        ]);
        const limited = hitStepLimit(reason, steps.length);
        if (limited) {
            const delta = `\n\n${STEP_LIMIT_MESSAGE}`;
            content += delta;
            onContent(delta);
        }
        if (!content.trim()) throw new Error("Agent produced no response");
        return {
            content,
            finishReason: limited ? "length" : openAIFinishReason(reason),
            usage: strictAgentUsage(steps),
            toolCallCounts,
        };
    } finally {
        await close();
    }
}

async function streamAgent(
    runtime: PromptAgentRuntime,
    messages: ModelMessage[],
    signal: AbortSignal,
    id: string,
    created: number,
): Promise<Response> {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (payload: unknown) =>
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
                );
            try {
                const out = await streamPromptAgent(
                    runtime,
                    messages,
                    signal,
                    (content) =>
                        send(
                            contentChunk(
                                id,
                                created,
                                runtime.config.baseModel,
                                content,
                            ),
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
                            finish_reason: out.finishReason,
                        },
                    ],
                    usage: buildUsage(out.usage, out.toolCallCounts),
                });
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            } catch (error) {
                send({
                    error: {
                        message: agentErrorMessage(error),
                        type: "upstream_error",
                        code: "agent_error",
                    },
                });
            } finally {
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
        const out = await runPromptAgent(runtime, messages, signal);
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
