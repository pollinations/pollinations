import { createMCPClient } from "@ai-sdk/mcp";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getLogger } from "@logtape/logtape";
import type { PromptAgentListingPayload } from "@shared/community-endpoints.ts";
import type { McpServerId } from "@shared/registry/mcp.ts";
import {
    type CompletionUsage,
    CompletionUsageSchema,
} from "@shared/schemas/openai.ts";
import {
    type FinishReason,
    type LanguageModelCallOptions,
    type ModelMessage,
    stepCountIs,
    type TextStreamPart,
    ToolLoopAgent,
    type ToolLoopAgentSettings,
    type ToolSet,
} from "ai";

import { safeMcpModelOutput } from "./mcp.ts";

const log = getLogger(["gen", "prompt-agent-runtime"]);

export type PromptAgentRuntime = {
    config: PromptAgentListingPayload;
    apiKey: string;
    genBaseUrl: string;
    fetcher: typeof fetch;
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
    finishReason: string;
    usage: AgentUsage;
    toolCallCounts: ToolCallCounts;
};

export type AgentPart =
    | Extract<
          TextStreamPart<ToolSet>,
          { type: "tool-call" | "tool-result" | "tool-error" }
      >
    | { type: "text-delta"; text: string };

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
    promptCacheBreakpoint?: boolean;
};

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
                    fetcher(input, {
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
                runtime.fetcher,
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
    const pollinations = createOpenAICompatible({
        name: "pollinations",
        apiKey: runtime.apiKey,
        baseURL: `${genBaseUrl}/v1`,
        fetch: runtime.fetcher,
        metadataExtractor: {
            async extractMetadata({ parsedBody }) {
                return {
                    pollinations: {
                        completionUsage: completionUsageFromBody(parsedBody),
                    },
                };
            },
            createStreamExtractor() {
                let usage: unknown;
                return {
                    processChunk(chunk) {
                        if (
                            chunk &&
                            typeof chunk === "object" &&
                            "usage" in chunk &&
                            chunk.usage != null
                        ) {
                            // Providers may send provisional counts before final usage.
                            usage = chunk.usage;
                        }
                    },
                    buildMetadata() {
                        return {
                            pollinations: {
                                completionUsage:
                                    usage == null
                                        ? null
                                        : completionUsage(usage),
                            },
                        };
                    },
                };
            },
        },
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
