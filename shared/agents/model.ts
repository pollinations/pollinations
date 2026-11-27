import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
    type FinishReason,
    type LanguageModelMiddleware,
    type ToolSet,
    wrapLanguageModel,
} from "ai";
import {
    chatCompletionChoiceError,
    extractProviderErrorMessage,
} from "../http/chat-completion-error.ts";
import {
    type CompletionUsage,
    CompletionUsageSchema,
} from "../schemas/openai.ts";
import type { AgentUsage } from "./types.ts";

type AgentStep = {
    providerMetadata?: Record<string, Record<string, unknown>>;
};

const MODEL_FAILURE = "Agent model failed to complete the response";

function choiceFinishError(body: unknown): string | null {
    const error = (body as { error?: unknown } | null)?.error;
    return (
        extractProviderErrorMessage(error)?.trim() ??
        chatCompletionChoiceError(body, {
            fallback: MODEL_FAILURE,
            includeUnmarkedErrors: true,
        }) ??
        null
    );
}

function agentModelError({
    finishReason,
    providerMetadata,
}: AgentStep & { finishReason: { raw?: string; unified: FinishReason } }):
    | Error
    | undefined {
    const message = providerMetadata?.pollinations?.finishError;
    if (typeof message === "string") return new Error(message);
    if (finishReason.raw === "error" || finishReason.unified === "error") {
        return new Error(MODEL_FAILURE);
    }
    return undefined;
}

const rejectFailedStep: LanguageModelMiddleware = {
    async wrapGenerate({ doGenerate }) {
        const result = await doGenerate();
        const error = agentModelError(result);
        if (error) throw error;
        return result;
    },
    async wrapStream({ doStream }) {
        const { stream, ...result } = await doStream();
        type Part =
            typeof stream extends ReadableStream<infer Value> ? Value : never;
        // The SDK invokes tool input callbacks on start/delta as well as
        // executing completed tool calls. Release both after a successful step.
        const toolParts: Part[] = [];
        let failed = false;
        return {
            ...result,
            stream: stream.pipeThrough(
                new TransformStream<Part, Part>({
                    transform(part, controller) {
                        if (part.type.startsWith("tool-")) {
                            if (!failed) toolParts.push(part);
                            return;
                        }
                        if (part.type === "error") {
                            failed = true;
                            toolParts.length = 0;
                        }
                        if (part.type === "finish" && !failed) {
                            const error = agentModelError(part);
                            if (error) {
                                controller.enqueue({ type: "error", error });
                                return;
                            }
                            for (const toolPart of toolParts)
                                controller.enqueue(toolPart);
                        }
                        controller.enqueue(part);
                    },
                }),
            ),
        };
    },
};

export function createAgentModelProvider({
    baseURL,
    fetch: fetcher,
    apiKey,
}: {
    baseURL: string;
    fetch: typeof fetch;
    apiKey?: string;
}) {
    const provider = createOpenAICompatible({
        name: "pollinations",
        ...(apiKey ? { apiKey } : {}),
        baseURL,
        fetch: fetcher,
        metadataExtractor: {
            async extractMetadata({ parsedBody }) {
                return {
                    pollinations: {
                        completionUsage: completionUsageFromBody(parsedBody),
                        finishError: choiceFinishError(parsedBody),
                    },
                };
            },
            createStreamExtractor() {
                let usage: unknown;
                let finishError: string | null = null;
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
                        finishError = choiceFinishError(chunk) ?? finishError;
                    },
                    buildMetadata() {
                        return {
                            pollinations: {
                                completionUsage:
                                    usage == null
                                        ? null
                                        : completionUsage(usage),
                                finishError,
                            },
                        };
                    },
                };
            },
        },
    });
    const languageModel: typeof provider.languageModel = (modelId, config) =>
        wrapLanguageModel({
            model: provider.languageModel(modelId, config),
            middleware: rejectFailedStep,
        });
    return Object.assign(languageModel, provider, {
        languageModel,
        chatModel: languageModel,
    });
}

/** Whether the run stopped on calls only the caller can answer (no execute). */
export function awaitsCaller(
    steps: { toolCalls: { toolName: string; invalid?: boolean }[] }[],
    tools: ToolSet,
): boolean {
    return (
        steps
            .at(-1)
            ?.toolCalls.some(
                (call) =>
                    !call.invalid &&
                    Object.hasOwn(tools, call.toolName) &&
                    !tools[call.toolName].execute,
            ) ?? false
    );
}

export function openAIFinishReason(reason: FinishReason): string {
    if (reason === "error") {
        throw new Error(MODEL_FAILURE);
    }
    if (reason === "tool-calls") return "tool_calls";
    if (reason === "content-filter") return "content_filter";
    if (reason === "stop" || reason === "length") return reason;
    return "stop";
}

function completionUsage(value: unknown): CompletionUsage | null {
    const parsed = CompletionUsageSchema.safeParse(value);
    // Reject invalid usage only after the SDK resolves its result. Throwing
    // inside metadata extraction also rejects the SDK's sibling promises.
    return parsed.success ? parsed.data : null;
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

export function strictAgentUsage(steps: AgentStep[]): AgentUsage {
    const usages = steps.map((step) => {
        const usage = completionUsage(
            step.providerMetadata?.pollinations?.completionUsage,
        );
        if (!usage) throw new Error("Agent response omitted valid usage");
        return usage;
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
