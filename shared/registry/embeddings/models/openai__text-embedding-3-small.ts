import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "openai/text-embedding-3-small";

export default {
    aliases: ["embedding-small", "openai-3-small"],
    provider: "azure",
    publisher: "OpenAI",
    category: "embedding",
    addedDate: new Date("2026-05-08").getTime(),
    // Provider retires this route on 2028-02-09.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0.02),
    },
    title: "Text Embedding 3 Small",
    description:
        "Low-cost text vectors for search and similarity. 1536 dimensions, 8192 token limit.",
    inputModalities: ["text"],
    outputModalities: ["embedding"],
    contextLength: 8192,
} satisfies ModelDefinition;
