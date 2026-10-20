import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "openai/text-embedding-3-large";

export default {
    aliases: ["embedding-large", "openai-3-large"],
    provider: "azure",
    publisher: "OpenAI",
    category: "embedding",
    addedDate: new Date("2026-05-08").getTime(),
    // Provider retires this route on 2028-02-09.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0.13),
    },
    title: "Text Embedding 3 Large",
    description:
        "High-quality text vectors for demanding search. 3072 dimensions, 8192 token limit.",
    inputModalities: ["text"],
    outputModalities: ["embedding"],
    contextLength: 8192,
} satisfies ModelDefinition;
