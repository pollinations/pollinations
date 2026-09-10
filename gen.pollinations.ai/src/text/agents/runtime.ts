import { createMCPClient } from "@ai-sdk/mcp";
import { getLogger } from "@logtape/logtape";
import { safeMcpModelOutput } from "@shared/agents/mcp-output.ts";
import {
    createAgentModelProvider,
    openAIFinishReason,
    strictAgentUsage,
} from "@shared/agents/model.ts";
import type {
    AgentOutput,
    AgentPart,
    AgentGenerationSettings as PromptAgentGenerationSettings,
    ToolCallCounts,
} from "@shared/agents/types.ts";
import type { PromptAgentListingPayload } from "@shared/community-endpoints.ts";
import type { McpServerId } from "@shared/registry/mcp.ts";
import {
    type FinishReason,
    type ModelMessage,
    stepCountIs,
    ToolLoopAgent,
} from "ai";

const log = getLogger(["gen", "prompt-agent-runtime"]);

export type PromptAgentRuntime = {
    config: PromptAgentListingPayload;
    apiKey: string;
    genBaseUrl: string;
    fetcher: typeof fetch;
};

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;
type McpTool = Awaited<ReturnType<McpClient["tools"]>>[string];
const MAX_STEPS = 8;
const MAX_TOOL_CALLS = 16;
const MCP_INITIALIZATION_TIMEOUT_MS = 15_000;
const STEP_LIMIT_MESSAGE =
    "The agent reached its maximum number of tool-use steps without a final answer.";

async function loadMcpTools(
    serverId: McpServerId,
    url: string,
    apiKey: string,
    signal: AbortSignal,
    fetcher: typeof fetch,
): Promise<{
    tools: Record<string, McpTool>;
    client: McpClient;
}> {
    const client = await createMCPClient({
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
                fetcher(input, {
                    ...init,
                    redirect: "follow",
                }),
        },
    });
    const tools: Record<string, McpTool> = {};

    try {
        for (const [name, definition] of Object.entries(await client.tools())) {
            tools[`mcp__${serverId}__${name}`] = definition;
        }
        log.info("MCP_SERVER_LOADED: name={name} url={url} tools={tools}", {
            name: serverId,
            url,
            tools: Object.keys(tools).length,
        });
    } catch (error) {
        await client.close();
        throw error;
    }

    return { tools, client };
}

async function createAgent(
    runtime: PromptAgentRuntime,
    signal: AbortSignal,
    settings: PromptAgentGenerationSettings = {},
) {
    const genBaseUrl = runtime.genBaseUrl.replace(/\/$/, "");
    // Wait for every loader so a late-opening session is also closed on failure.
    const serverResults = await Promise.allSettled(
        runtime.config.mcpServers.map((serverId) =>
            loadMcpTools(
                serverId,
                `${genBaseUrl}/mcp/${serverId}`,
                runtime.apiKey,
                signal,
                runtime.fetcher,
            ),
        ),
    );
    const loadedServers = serverResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
    );
    const close = async () => {
        await Promise.all(loadedServers.map((server) => server.client.close()));
    };
    const failure = serverResults.find(
        (result) => result.status === "rejected",
    );
    if (failure) {
        await close();
        throw failure.reason;
    }
    const tools: Record<string, McpTool> = {};
    for (const server of loadedServers) {
        Object.assign(tools, server.tools);
    }
    const toolCallCounts: ToolCallCounts = {};
    let toolCalls = 0;
    for (const [name, tool] of Object.entries(tools)) {
        const execute = tool.execute;
        tools[name] = {
            ...tool,
            toModelOutput: safeMcpModelOutput,
            execute(input, options) {
                if (toolCalls >= MAX_TOOL_CALLS) {
                    throw new Error(
                        `Agent exceeded the maximum of ${MAX_TOOL_CALLS} tool calls`,
                    );
                }
                toolCallCounts.mcp_call = ++toolCalls;
                return execute(input, options);
            },
        };
    }
    const pollinations = createAgentModelProvider({
        baseURL: `${genBaseUrl}/v1`,
        fetch: runtime.fetcher,
        apiKey: runtime.apiKey,
    });

    const { promptCacheBreakpoint, ...agentSettings } = settings;
    const agent = new ToolLoopAgent({
        model: pollinations(runtime.config.baseModel),
        instructions: promptCacheBreakpoint
            ? {
                  role: "system",
                  content: runtime.config.systemPrompt,
                  providerOptions: {
                      openaiCompatible: {
                          prompt_cache_breakpoint: { mode: "explicit" },
                      },
                  },
              }
            : runtime.config.systemPrompt,
        allowSystemInMessages: true,
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
        ...agentSettings,
        // Model calls spend the caller's balance, so do not retry billed calls.
        maxRetries: 0,
    });

    return { agent, close, toolCallCounts };
}

function hitStepLimit(reason: FinishReason, stepCount: number): boolean {
    return reason === "tool-calls" && stepCount >= MAX_STEPS;
}

export async function runPromptAgent(
    runtime: PromptAgentRuntime,
    messages: ModelMessage[],
    signal: AbortSignal,
    onPart: (part: AgentPart) => void,
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
        for (const step of result.steps) {
            for (const part of step.content) {
                if (part.type === "text") {
                    onPart({ type: "text-delta", text: part.text });
                }
                if (
                    part.type === "tool-call" ||
                    part.type === "tool-result" ||
                    part.type === "tool-error"
                ) {
                    onPart(part);
                }
            }
        }
        if (limited) {
            onPart({ type: "text-delta", text: `\n\n${STEP_LIMIT_MESSAGE}` });
        }
        return {
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
    onPart: (part: AgentPart) => void,
    settings: PromptAgentGenerationSettings = {},
): Promise<AgentOutput> {
    const { agent, close, toolCallCounts } = await createAgent(
        runtime,
        signal,
        settings,
    );
    try {
        const result = await agent.stream({ messages, abortSignal: signal });
        for await (const part of result.fullStream) {
            if (part.type === "error") throw part.error;
            if (
                part.type === "text-delta" ||
                part.type === "tool-call" ||
                part.type === "tool-result" ||
                part.type === "tool-error"
            ) {
                onPart(part);
            }
        }
        const [reason, steps] = await Promise.all([
            result.finishReason,
            result.steps,
        ]);
        const limited = hitStepLimit(reason, steps.length);
        if (limited) {
            onPart({ type: "text-delta", text: `\n\n${STEP_LIMIT_MESSAGE}` });
        }
        return {
            finishReason: limited ? "length" : openAIFinishReason(reason),
            usage: strictAgentUsage(steps),
            toolCallCounts,
        };
    } finally {
        await close();
    }
}
