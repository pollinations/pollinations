import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "qwen/qwen3-embedding-8b";

export default {
    aliases: ["qwen3-embedding", "qwen3-embedding-8b"],
    provider: "deepinfra",
    publisher: "Qwen",
    category: "embedding",
    addedDate: new Date("2026-05-26").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        promptTextTokens: perMillion(0.01),
    },
    title: "Qwen3 Embedding 8B",
    description:
        "Multilingual text vectors. 4096 dimensions, 40,960-token context.",
    inputModalities: ["text"],
    outputModalities: ["embedding"],
    // Verified on the live DeepInfra route; its catalog still lists 32K.
    contextLength: 40960,
} satisfies ModelDefinition;
