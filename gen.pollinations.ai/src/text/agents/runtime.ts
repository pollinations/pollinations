import { createMCPClient } from "@ai-sdk/mcp";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { getLogger } from "@logtape/logtape";
import { safeMcpModelOutput } from "@shared/agents/mcp-output.ts";
import {
    createAgentModelProvider,
    openAIFinishReason,
    strictAgentUsage,
} from "@shared/agents/model.ts";
import { runSdkAgent } from "@shared/agents/sdk-runner.ts";
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
    type ToolSet,
    tool,
} from "ai";

const log = getLogger(["gen", "prompt-agent-runtime"]);

export type PromptAgentRuntime = {
    config: PromptAgentListingPayload;
    apiKey: string;
    genBaseUrl: string;
    fetcher: typeof fetch;
    loader: WorkerLoader;
};

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;
type McpTool = Awaited<ReturnType<McpClient["tools"]>>[string];
const MAX_STEPS = 24;
const MAX_TOOL_CALLS = 48;
const MCP_INITIALIZATION_TIMEOUT_MS = 15_000;
const STEP_LIMIT_MESSAGE =
    "The agent reached its maximum number of tool-use steps without a final answer.";
// The mcp__ prefix makes Responses treat it like the other Gen-run tools.
const CODE_TOOL_NAME = "mcp__codemode__execute";
const CODE_TOOL_DESCRIPTION = `Run JavaScript that calls your tools. Use it to chain tool calls, run independent calls in parallel with Promise.all, and return only what you need.

Available:
{{types}}

Write an async arrow function in plain JavaScript (no TypeScript) and return the result. A tool function returns the tool's structured content, or its text (parsed when it is JSON), and throws when the tool fails. console.log output is returned with the result. The code has no network access.

Example: async () => { const [a, b] = await Promise.all([server.search({ query: "a" }), server.search({ query: "b" })]); return { a, b }; }`;

async function loadMcpTools(
    serverId: McpServerId,
    url: string,
    apiKey: string,
    signal: AbortSignal,
    fetcher: typeof fetch,
): Promise<{
    serverId: McpServerId;
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
    let tools: Record<string, McpTool>;

    try {
        tools = await client.tools();
        log.info("MCP_SERVER_LOADED: name={name} url={url} tools={tools}", {
            name: serverId,
            url,
            tools: Object.keys(tools).length,
        });
    } catch (error) {
        await client.close();
        throw error;
    }

    return { serverId, tools, client };
}

// Follows @cloudflare/codemode's own (unexported) MCP unwrapping: tool errors
// throw, structured content wins, and text is parsed when it is JSON.
function codeValue(result: unknown): unknown {
    const output = result as {
        content?: { type?: string; text?: string }[];
        structuredContent?: unknown;
        isError?: boolean;
    } | null;
    if (!Array.isArray(output?.content)) return result;
    const text = output.content.every((part) => part?.type === "text")
        ? output.content.map((part) => part.text).join("\n")
        : undefined;
    if (output.isError) throw new Error(text || "Tool call failed");
    if (output.structuredContent != null) return output.structuredContent;
    if (text === undefined) return result;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

// One tool that runs model-written JavaScript in a Dynamic Worker with no
// network access. Each MCP server is a namespace in the sandbox (ask-jev
// becomes ask_jev); calls come back to Gen and run as ordinary MCP calls.
function createCodemodeTools(
    servers: { serverId: McpServerId; tools: Record<string, McpTool> }[],
    loader: WorkerLoader,
    signal: AbortSignal,
): ToolSet {
    const sandbox = new DynamicWorkerExecutor({ loader, globalOutbound: null });
    const code = createCodeTool({
        tools: servers.map(({ serverId, tools }) => ({
            name: serverId.replaceAll("-", "_"),
            tools: Object.fromEntries(
                Object.entries(tools).map(([name, mcpTool]) => [
                    name,
                    {
                        ...mcpTool,
                        execute: async (input: unknown) =>
                            codeValue(
                                await mcpTool.execute(input, {
                                    toolCallId: crypto.randomUUID(),
                                    messages: [],
                                    abortSignal: signal,
                                    context: undefined,
                                }),
                            ),
                    },
                ]),
            ),
        })),
        executor: {
            // codemode 0.5.3 keeps the `;` of `async () => {...};`, which
            // then fails to parse when the sandbox calls the function.
            execute: (source, providers, options) =>
                sandbox.execute(
                    source.replace(/;\s*$/, ""),
                    providers,
                    options,
                ),
        },
        description: CODE_TOOL_DESCRIPTION,
    });
    return {
        [CODE_TOOL_NAME]: tool({
            description: code.description,
            inputSchema: code.inputSchema,
            execute: async (input, options) => ({
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            await code.execute?.(input, options),
                        ),
                    },
                ],
            }),
            toModelOutput: safeMcpModelOutput,
        }),
    };
}

async function createAgent(
    runtime: PromptAgentRuntime,
    signal: AbortSignal,
    settings: PromptAgentGenerationSettings = {},
    callerTools: ToolSet = {},
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
    const toolCallCounts: ToolCallCounts = {};
    let toolCalls = 0;
    for (const server of loadedServers) {
        for (const [name, mcpTool] of Object.entries(server.tools)) {
            const execute = mcpTool.execute;
            server.tools[name] = {
                ...mcpTool,
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
            tools[`mcp__${server.serverId}__${name}`] = server.tools[name];
        }
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
        tools: {
            ...callerTools,
            ...(runtime.config.codemode
                ? createCodemodeTools(loadedServers, runtime.loader, signal)
                : tools),
        },
        stopWhen: stepCountIs(MAX_STEPS),
        ...agentSettings,
        // Model calls spend the caller's balance, so do not retry billed calls.
        maxRetries: 0,
    });

    return { agent, close, toolCallCounts };
}

function hitStepLimit(
    reason: FinishReason,
    steps: Awaited<ReturnType<typeof runSdkAgent>>["steps"],
    callerTools: ToolSet,
): boolean {
    return (
        reason === "tool-calls" &&
        steps.length >= MAX_STEPS &&
        !steps
            .at(-1)
            ?.toolCalls.some(
                (call) =>
                    !call.invalid && Object.hasOwn(callerTools, call.toolName),
            )
    );
}

export async function runPromptAgent(
    runtime: PromptAgentRuntime,
    messages: ModelMessage[],
    signal: AbortSignal,
    onPart: (part: AgentPart) => void,
    settings: PromptAgentGenerationSettings = {},
    callerTools: ToolSet = {},
): Promise<AgentOutput> {
    const { agent, close, toolCallCounts } = await createAgent(
        runtime,
        signal,
        settings,
        callerTools,
    );
    try {
        const result = await runSdkAgent(agent, {
            messages,
            signal,
            stream: false,
            onPart,
        });
        const limited = hitStepLimit(
            result.finishReason,
            result.steps,
            callerTools,
        );
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
    callerTools: ToolSet = {},
): Promise<AgentOutput> {
    const { agent, close, toolCallCounts } = await createAgent(
        runtime,
        signal,
        settings,
        callerTools,
    );
    try {
        const { finishReason: reason, steps } = await runSdkAgent(agent, {
            messages,
            signal,
            stream: true,
            onPart,
        });
        const limited = hitStepLimit(reason, steps, callerTools);
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
