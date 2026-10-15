import {
    jsonSchema,
    stepCountIs,
    ToolLoopAgent,
    type ToolLoopAgentSettings,
    type ToolSet,
    tool,
} from "ai";
import { safeMcpModelOutput } from "../../../shared/agents/mcp-output.ts";
import {
    createAgentModelProvider,
    openAIFinishReason,
    strictAgentUsage,
} from "../../../shared/agents/model.ts";
import { handleAgentResponsesRequest } from "../../../shared/agents/responses.ts";
import { runSdkAgent } from "../../../shared/agents/sdk-runner.ts";
import type { AgentRunner } from "../../../shared/agents/types.ts";
import { CreateResponseRequestSchema } from "../../../shared/schemas/openai.ts";

type Mcp = {
    (
        server: string,
        name: string,
        args: Record<string, unknown>,
        signal?: AbortSignal,
    ): Promise<unknown>;
    listTools(server: string): Promise<
        {
            name: string;
            description?: string;
            inputSchema: Parameters<typeof jsonSchema>[0];
        }[]
    >;
    tools?: (server: string) => Promise<ToolSet>;
};

export function createCodeAgentAI(
    request: Request,
    baseUrl: string,
    pollinations: typeof fetch,
    mcp: Mcp,
) {
    // The agent may read its own request before calling respond().
    const responseRequest = request.clone();
    const model = createAgentModelProvider({
        baseURL: `${baseUrl.replace(/\/$/, "")}/v1`,
        fetch: pollinations,
    });
    const toolCallCounts: Record<string, number> = {};
    mcp.tools = async (server) => {
        const tools: ToolSet = {};
        for (const definition of await mcp.listTools(server)) {
            tools[`mcp__${server}__${definition.name}`] = tool({
                description: definition.description,
                inputSchema: jsonSchema<Record<string, unknown>>(
                    definition.inputSchema,
                ),
                toModelOutput: safeMcpModelOutput,
                execute: (input, { abortSignal }) => {
                    if ((toolCallCounts.mcp_call ?? 0) >= 16) {
                        throw new Error(
                            "Agent exceeded the maximum of 16 tool calls",
                        );
                    }
                    toolCallCounts.mcp_call =
                        (toolCallCounts.mcp_call ?? 0) + 1;
                    return mcp(server, definition.name, input, abortSignal);
                },
            });
        }
        return tools;
    };

    async function respond(config: ToolLoopAgentSettings<never, ToolSet>) {
        let body: unknown;
        try {
            body = await responseRequest.json();
        } catch {
            return Response.json(
                {
                    error: {
                        message: "Invalid JSON request",
                        type: "invalid_request_error",
                    },
                },
                { status: 400 },
            );
        }
        const parsed = CreateResponseRequestSchema.safeParse(body);
        if (!parsed.success) {
            return Response.json(
                {
                    error: {
                        message: "Invalid Responses request",
                        type: "invalid_request_error",
                    },
                },
                { status: 400 },
            );
        }
        const run: AgentRunner = async ({
            messages,
            settings,
            signal,
            stream,
            onPart,
        }) => {
            const { promptCacheBreakpoint, ...generation } = settings;
            const agent = new ToolLoopAgent<never, ToolSet>({
                allowSystemInMessages: true,
                stopWhen: stepCountIs(8),
                ...config,
                ...generation,
                providerOptions: {
                    ...config.providerOptions,
                    ...generation.providerOptions,
                    pollinations: {
                        ...config.providerOptions?.pollinations,
                        ...generation.providerOptions?.pollinations,
                    },
                },
                ...(promptCacheBreakpoint &&
                typeof config.instructions === "string"
                    ? {
                          instructions: {
                              role: "system" as const,
                              content: config.instructions,
                              providerOptions: {
                                  openaiCompatible: {
                                      prompt_cache_breakpoint: {
                                          mode: "explicit",
                                      },
                                  },
                              },
                          },
                      }
                    : {}),
                // Retries would spend the caller's balance again.
                maxRetries: 0,
            });
            const { finishReason: reason, steps } = await runSdkAgent(agent, {
                messages,
                signal,
                stream,
                onPart,
            });
            const stoppedWithoutAnswer = reason === "tool-calls";
            if (stoppedWithoutAnswer) {
                onPart({
                    type: "text-delta",
                    text: "\n\nThe agent reached its stopping condition without a final answer.",
                });
            }
            return {
                finishReason: stoppedWithoutAnswer
                    ? "length"
                    : openAIFinishReason(reason),
                usage: strictAgentUsage(steps),
                toolCallCounts,
            };
        };
        return handleAgentResponsesRequest(
            parsed.data,
            request.signal,
            run,
            config.tools,
        );
    }

    return { model, respond };
}
