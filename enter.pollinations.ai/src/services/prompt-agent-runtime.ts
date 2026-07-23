import { createMCPClient } from "@ai-sdk/mcp";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
    type FinishReason,
    type ModelMessage,
    stepCountIs,
    ToolLoopAgent,
} from "ai";
import type { PromptAgentConfig } from "./prompt-agent.ts";

export type PromptAgentRequest = {
    messages?: ModelMessage[];
    stream?: boolean;
};

type PromptAgentRuntime = {
    config: PromptAgentConfig;
    apiKey: string;
    genBaseUrl: string;
};

type McpServer = { name: string; url: string };
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
const STEP_LIMIT_MESSAGE =
    "The agent reached its maximum number of tool-use steps without a final answer.";

async function loadMcpTools(servers: McpServer[]): Promise<{
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
                transport: {
                    type: "http",
                    url: server.url,
                    // Cloudflare Workers supports follow/manual, not error.
                    redirect: "follow",
                },
            });
            clients.push(client);
            for (const [name, definition] of Object.entries(
                await client.tools(),
            )) {
                tools[`mcp__${server.name}__${name}`] = definition;
            }
        }
    } catch (error) {
        await close();
        throw error;
    }

    return { tools, close };
}

async function createAgent(runtime: PromptAgentRuntime) {
    const { tools, close } = await loadMcpTools(runtime.config.mcpServers);
    const toolCallCounts: ToolCallCounts = {};
    const pollinations = createOpenAICompatible({
        name: "pollinations",
        apiKey: runtime.apiKey,
        baseURL: `${runtime.genBaseUrl.replace(/\/$/, "")}/v1`,
    });

    const agent = new ToolLoopAgent({
        model: pollinations(runtime.config.baseModel),
        instructions: runtime.config.systemPrompt,
        allowSystemInMessages: true,
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
        // Model calls spend the owner's balance, so do not retry billed calls.
        maxRetries: 0,
        onToolExecutionStart: () => {
            toolCallCounts.mcp_call = (toolCallCounts.mcp_call ?? 0) + 1;
        },
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

async function runAgent(
    runtime: PromptAgentRuntime,
    messages: ModelMessage[],
    signal: AbortSignal,
): Promise<AgentOutput> {
    const { agent, close, toolCallCounts } = await createAgent(runtime);
    try {
        const result = await agent.generate({
            messages,
            abortSignal: signal,
        });
        const limited = hitStepLimit(result.finishReason, result.steps.length);
        return {
            content: limited ? STEP_LIMIT_MESSAGE : result.text,
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
    const { agent, close, toolCallCounts } = await createAgent(runtime);
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
            try {
                for await (const delta of result.textStream) {
                    send(
                        contentChunk(
                            id,
                            created,
                            runtime.config.baseModel,
                            delta,
                        ),
                    );
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
                            STEP_LIMIT_MESSAGE,
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
                send({ error: { message: String(error) } });
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
        return Response.json(
            { error: { message: String(error) } },
            { status: 502 },
        );
    }
}
