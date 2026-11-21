import type { Usage, UsageType } from "@shared/registry/registry.ts";
import { z } from "zod";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const details = z.array(z.object({ modality: z.string(), tokenCount: count }));
const vertexUsage = z.object({
    promptTokenCount: count.optional().default(0),
    candidatesTokenCount: count.optional().default(0),
    thoughtsTokenCount: count.optional().default(0),
    totalTokenCount: count.positive(),
    promptTokensDetails: details.optional().default([]),
    candidatesTokensDetails: details.optional().default([]),
});

const inputFields: ReadonlyMap<string, UsageType> = new Map([
    ["TEXT", "promptTextTokens"],
    ["AUDIO", "promptAudioTokens"],
    ["IMAGE", "promptImageTokens"],
    ["VIDEO", "promptVideoTokens"],
]);
const outputFields: ReadonlyMap<string, UsageType> = new Map([
    ["TEXT", "completionTextTokens"],
    ["AUDIO", "completionAudioTokens"],
]);

function addModalities(
    usage: Usage,
    tokens: z.infer<typeof details>,
    fields: ReadonlyMap<string, UsageType>,
    expected: number,
): boolean {
    let total = 0;
    for (const { modality, tokenCount } of tokens) {
        const field = fields.get(modality);
        if (!field) return false;
        if (tokenCount) usage[field] = (usage[field] ?? 0) + tokenCount;
        total += tokenCount;
    }
    return total === expected;
}

export function parseGeminiLiveUsage(metadata: unknown): Usage | null {
    const parsed = vertexUsage.safeParse(metadata);
    if (!parsed.success) return null;
    const {
        promptTokenCount,
        candidatesTokenCount,
        thoughtsTokenCount,
        totalTokenCount,
        promptTokensDetails,
        candidatesTokensDetails,
    } = parsed.data;
    // Vertex reports thinking separately from the visible candidate tokens.
    if (
        promptTokenCount + candidatesTokenCount + thoughtsTokenCount !==
        totalTokenCount
    )
        return null;
    const usage: Usage = {};
    if (
        !addModalities(
            usage,
            promptTokensDetails,
            inputFields,
            promptTokenCount,
        ) ||
        !addModalities(
            usage,
            candidatesTokensDetails,
            outputFields,
            candidatesTokenCount,
        )
    )
        return null;
    if (thoughtsTokenCount)
        usage.completionReasoningTokens = thoughtsTokenCount;
    return usage;
}
