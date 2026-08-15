import { type CallToolResult, createMCPClient } from "@ai-sdk/mcp";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
    APICallError,
    type FinishReason,
    type ModelMessage,
    stepCountIs,
    ToolLoopAgent,
} from "ai";
import { z } from "zod";
import type {
    PromptAgentConfig,
    PromptAgentMcpHeaders,
} from "./prompt-agent.ts";

export const PromptAgentRequestSchema = z
    .object({
        messages: z.array(z.custom<ModelMessage>()).optional().default([]),
        stream: z.boolean().optional().default(false),
    })
    .passthrough();

export const PromptAgentRuntimeRequestSchema = PromptAgentRequestSchema.extend({
    model: z.string().uuid(),
});

export type PromptAgentRequest = z.output<typeof PromptAgentRequestSchema>;

type PromptAgentRuntime = {
    config: PromptAgentConfig;
    mcpHeaders: PromptAgentMcpHeaders;
    apiKey: string;
    genBaseUrl: string;
    pollinationsMcpUrl: string;
};

type McpServer = {
    name: string;
    url: string;
    headers?: Record<string, string>;
    includeTools?: string[];
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
const POLLINATIONS_AGENT_TOOLS = [
    "generateImage",
    "generateVideo",
    "generate3D",
    "generateText",
    "createEmbeddings",
    "generateAudio",
    "listModels",
    "getModelStatus",
];
const STEP_LIMIT_MESSAGE =
    "The agent reached its maximum number of tool-use steps without a final answer.";

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
    servers: McpServer[],
    signal: AbortSignal,
): Promise<{
    tools: Record<string, McpTool>;
    close: () => Promise<void>;
}> {
    const clients: McpClient[] = [];
    const tools: Record<string, McpTool> = {};
    let closed = false;

    const close = async () => {
        if (closed) return;
        closed = true;
        await Promise.all(clients.map((client) => client.close()));
    };

    try {
        for (const server of servers) {
            const client = await createMCPClient({
                clientName: "pollinations-prompt-agent",
                initializationOptions: {
                    signal,
                    timeout: MCP_INITIALIZATION_TIMEOUT_MS,
                },
                transport: {
                    type: "http",
                    url: server.url,
                    headers: server.headers,
                    fetch: async (input, init) => {
                        const response = await globalThis.fetch.call(
                            globalThis,
                            input,
                            { ...init, redirect: "manual" },
                        );
                        if (response.status >= 300 && response.status < 400) {
                            await response.body?.cancel();
                            throw new Error(
                                "MCP server redirects are not allowed",
                            );
                        }
                        return response;
                    },
                },
            });
            clients.push(client);
            for (const [name, definition] of Object.entries(
                await client.tools(),
            )) {
                if (server.includeTools && !server.includeTools.includes(name))
                    continue;
                tools[`mcp__${server.name}__${name}`] = definition;
            }
        }
    } catch (error) {
        await close();
        throw error;
    }

    return { tools, close };
}

async function createAgent(runtime: PromptAgentRuntime, signal: AbortSignal) {
    const servers: McpServer[] = runtime.config.mcpServers.map((server) => {
        const storedHeaders = runtime.mcpHeaders[server.name] ?? {};
        return {
            name: server.name,
            url: server.url,
            headers: Object.fromEntries(
                server.headers.flatMap((name) =>
                    storedHeaders[name] === undefined
                        ? []
                        : [[name, storedHeaders[name]]],
                ),
            ),
        };
    });
    if (runtime.config.pollinationsTools) {
        servers.push({
            name: "pollinations",
            url: runtime.pollinationsMcpUrl,
            headers: { Authorization: `Bearer ${runtime.apiKey}` },
            includeTools: POLLINATIONS_AGENT_TOOLS,
        });
    }
    const { tools, close } = await loadMcpTools(servers, signal);
    if (runtime.config.pollinationsTools) {
        const imageTool = tools.mcp__pollinations__generateImage;
        if (imageTool) {
            tools.mcp__pollinations__generateImage = forceImageUrl(imageTool);
        }
    }
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
        baseURL: `${runtime.genBaseUrl.replace(/\/$/, "")}/v1`,
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

function forceImageUrl(tool: McpTool): McpTool {
    const execute = tool.execute;
    return {
        ...tool,
        execute(input, options) {
            const params =
                input && typeof input === "object" && !Array.isArray(input)
                    ? input
                    : {};
            return execute({ ...params, response_format: "url" }, options);
        },
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
                    content += mediaResultContent(
                        part.toolName,
                        part.output,
                        seenUrls,
                        content.length > 0,
                    );
                }
            }
        }
        return {
            content: limited ? `${content}\n\n${STEP_LIMIT_MESSAGE}` : content,
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
                        hasContent ||= part.text.length > 0;
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
                        const content = mediaResultContent(
                            part.toolName,
                            part.output,
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
                send({ error: { message: agentErrorMessage(error) } });
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
    const messages = Array.isArray(body.messages) ? body.messages : [];
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
