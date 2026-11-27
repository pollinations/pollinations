import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { FinishReason, ToolSet } from "ai";
import {
    type CompletionUsage,
    CompletionUsageSchema,
} from "../schemas/openai.ts";
import type { AgentUsage } from "./types.ts";

type AgentStep = {
    providerMetadata?: Record<string, Record<string, unknown>>;
};

function choiceFinishError(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    const record = body as {
        error?: unknown;
        choices?: Array<{ finish_reason?: unknown; error?: unknown }>;
    };
    const topError = extractErrorMessage(record.error);
    if (topError) return topError;
    for (const choice of record.choices ?? []) {
        if (choice?.finish_reason !== "error" && !choice?.error) continue;
        return (
            extractErrorMessage(choice.error) ??
            "Agent model failed to complete the response"
        );
    }
    return null;
}

function extractErrorMessage(error: unknown): string | null {
    if (typeof error === "string") return error.trim() || null;
    if (!error || typeof error !== "object") return null;
    const record = error as {
        message?: unknown;
        error?: { message?: unknown };
    };
    for (const candidate of [record.message, record.error?.message]) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }
    return null;
}

export function createAgentModelProvider({
    baseURL,
    fetch: fetcher,
    apiKey,
}: {
    baseURL: string;
    fetch: typeof fetch;
    apiKey?: string;
}) {
    return createOpenAICompatible({
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
        throw new Error("Agent model failed to complete the response");
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
    const finishError = steps
        .map((step) => step.providerMetadata?.pollinations?.finishError)
        .find(
            (message): message is string =>
                typeof message === "string" && message.length > 0,
        );
    if (finishError) throw new Error(finishError);

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
