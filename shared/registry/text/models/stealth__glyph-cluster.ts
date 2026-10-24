import { perMillion } from "../../price-helpers";

export const id = "stealth/glyph-cluster";

export default {
    aliases: [],
    supportedParameters: [
        "max_tokens",
        "stream",
        "temperature",
        "stop",
        "tools",
        "tool_choice",
        "reasoning_effort",
        "reasoning",
        "include_reasoning",
    ],
    provider: "vercel",
    // Vercel returned 429 bursts during light testing.
    perUserRpm: 8,
    publisher: "Stealth",
    category: "text",
    addedDate: new Date("2026-10-08").getTime(),
    priceMultiplier: 1,
    paidOnly: false,
    // Free only during stealth; expiry and subsequent rates are unpublished.
    // https://vercel.com/ai-gateway/models/glyph-cluster
    cost: {
        promptTextTokens: perMillion(0),
        completionTextTokens: perMillion(0),
        promptCachedTokens: perMillion(0),
    },
    title: "Glyph Cluster (Stealth)",
    description:
        "Experimental coding and long-context reasoning with automatic tool calling. Prompts and responses may be retained and used for training; no zero data retention.",
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextLength: 256000,
    // The Gateway rejects required and named tool choices; auto/none work.
    tools: true,
    reasoning: true,
    isSpecialized: false,
    alpha: true,
} satisfies ModelDefinition;
