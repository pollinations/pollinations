import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { FinishReason } from "ai";
import {
    type CompletionUsage,
    CompletionUsageSchema,
} from "../schemas/openai.ts";
import type { AgentUsage } from "./types.ts";

type AgentStep = {
    providerMetadata?: Record<string, Record<string, unknown>>;
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
}

export function openAIFinishReason(reason: FinishReason): string {
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
