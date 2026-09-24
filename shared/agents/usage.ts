import type { AgentUsage, ToolCallCounts } from "./types.ts";

function tokenCount(value: number | undefined, name: string): number {
    if (!Number.isSafeInteger(value) || (value ?? -1) < 0) {
        throw new Error(`Agent response omitted valid ${name}`);
    }
    return value as number;
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
