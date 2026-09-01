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

type PromptAgentRuntime = {
    config: PromptAgentConfig;
    apiKey: string;
    genBaseUrl: string;
    optillmBaseUrl: string;
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
};

const MAX_STEPS = 8;
const MAX_TOOL_CALLS = 16;
const MCP_INITIALIZATION_TIMEOUT_MS = 15_000;
const STEP_LIMIT_MESSAGE =
    "The agent reached its maximum number of tool-use steps without a final answer.";

export function optillmRequestFields(
    config: NonNullable<PromptAgentConfig["optillm"]>,
): Record<string, string | number | boolean> {
    switch (config.approach) {
        case "bon":
            return {
                optillm_approach: config.approach,
                best_of_n: config.bestOfN,
            };
        case "mcts":
            return {
                optillm_approach: config.approach,
                mcts_simulations: config.simulations,
                mcts_depth: config.depth,
                mcts_exploration: config.exploration,
            };
        case "rstar":
            return {
                optillm_approach: config.approach,
                rstar_max_depth: config.maxDepth,
                rstar_num_rollouts: config.rollouts,
                rstar_c: config.exploration,
            };
        default:
            return { optillm_approach: config.approach };
    }
}

function optillmFetch(
    config: NonNullable<PromptAgentConfig["optillm"]>,
): typeof fetch {
    return async (input, init) => {
        if (typeof init?.body !== "string") {
            throw new Error("OptiLLM request body must be JSON");
        }
        const body = JSON.parse(init.body) as Record<string, unknown>;
        return globalThis.fetch.call(globalThis, input, {
            ...init,
            body: JSON.stringify({ ...body, ...optillmRequestFields(config) }),
        });
    };
}

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

async function createAgent(runtime: PromptAgentRuntime, signal: AbortSignal) {
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
    const optillm = runtime.config.optillm;
    const pollinations = createOpenAICompatible({
        name: "pollinations",
        apiKey: runtime.apiKey,
        baseURL: optillm
            ? runtime.optillmBaseUrl.replace(/\/$/, "")
            : `${genBaseUrl}/v1`,
        ...(optillm ? { fetch: optillmFetch(optillm) } : {}),
    });

    const agent = new ToolLoopAgent({
        model: pollinations(runtime.config.baseModel),
        instructions: runtime.config.systemPrompt,
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
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

async function runAgent(
    runtime: PromptAgentRuntime,
    messages: ModelMessage[],
    signal: AbortSignal,
): Promise<AgentOutput> {
    const { agent, close, toolCallCounts } = await createAgent(runtime, signal);
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
    const { agent, close, toolCallCounts } = await createAgent(runtime, signal);
    let result: Awaited<ReturnType<typeof agent.stream>>;
    try {
        result = await agent.stream({ messages, abortSignal: signal });
    } catch (error) {
        await close();
        throw error;
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (payload: unknown) =>
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
                );
            const seenUrls = new Set<string>();
            let hasContent = false;
            try {
                for await (const part of result.fullStream) {
                    if (part.type === "error") throw part.error;
                    if (part.type === "text-delta") {
                        hasContent ||= part.text.trim().length > 0;
                        send(
                            contentChunk(
                                id,
                                created,
                                runtime.config.baseModel,
                                part.text,
                            ),
                        );
                    }
                    if (part.type === "tool-result") {
                        const content = toolResultContent(
                            part,
                            seenUrls,
                            hasContent,
                        );
                        if (content) {
                            hasContent = true;
                            send(
                                contentChunk(
                                    id,
                                    created,
                                    runtime.config.baseModel,
                                    content,
                                ),
                            );
                        }
                    }
                    if (part.type === "tool-error") {
                        const content = toolDetailsContent(
                            part,
                            "Tool Failed",
                            agentErrorMessage(part.error),
                            hasContent,
                        );
                        hasContent = true;
                        send(
                            contentChunk(
                                id,
                                created,
                                runtime.config.baseModel,
                                `${content}\n\n`,
                            ),
                        );
                    }
                }
                const [reason, usage, steps] = await Promise.all([
                    result.finishReason,
                    result.usage,
                    result.steps,
                ]);
                const limited = hitStepLimit(reason, steps.length);
                if (limited) {
                    send(
                        contentChunk(
                            id,
                            created,
                            runtime.config.baseModel,
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
                    model: runtime.config.baseModel,
                    choices: [
                        {
                            index: 0,
                            delta: {},
                            finish_reason: limited
                                ? "length"
                                : openAIFinishReason(reason),
                        },
                    ],
                    usage: buildUsage(usage, toolCallCounts),
                });
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            } catch (error) {
                const content =
                    (hasContent ? "\n\n" : "") +
                    '<details type="error" done="true">\n' +
                    "<summary>Agent Failed</summary>\n" +
                    `${escapeHtml(agentErrorMessage(error))}\n` +
                    "</details>";
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
