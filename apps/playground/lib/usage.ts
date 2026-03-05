import type { LanguageModelUsage } from 'ai';

/**
 * Accumulates token usage across multiple `generateText` calls.
 * Only sums the numeric counters; provider-specific metadata is ignored.
 */
export function accumulateUsage(
  current: LanguageModelUsage | null,
  next?: LanguageModelUsage,
): LanguageModelUsage | null {
  if (!next) return current;

  const base: LanguageModelUsage = current ?? {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputTokenDetails: {
      noCacheTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokenDetails: {
      textTokens: 0,
      reasoningTokens: 0,
    },
  };

  return {
    inputTokens: (base.inputTokens ?? 0) + (next.inputTokens ?? 0),
    outputTokens: (base.outputTokens ?? 0) + (next.outputTokens ?? 0),
    totalTokens: (base.totalTokens ?? 0) + (next.totalTokens ?? 0),
    inputTokenDetails: {
      noCacheTokens:
        (base.inputTokenDetails.noCacheTokens ?? 0) +
        (next.inputTokenDetails?.noCacheTokens ?? 0),
      cacheReadTokens:
        (base.inputTokenDetails.cacheReadTokens ?? 0) +
        (next.inputTokenDetails?.cacheReadTokens ?? 0),
      cacheWriteTokens:
        (base.inputTokenDetails.cacheWriteTokens ?? 0) +
        (next.inputTokenDetails?.cacheWriteTokens ?? 0),
    },
    outputTokenDetails: {
      textTokens:
        (base.outputTokenDetails.textTokens ?? 0) +
        (next.outputTokenDetails?.textTokens ?? 0),
      reasoningTokens:
        (base.outputTokenDetails.reasoningTokens ?? 0) +
        (next.outputTokenDetails?.reasoningTokens ?? 0),
    },
  };
}

