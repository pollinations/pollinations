import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "cohere/embed-v4.0";

export default {
    aliases: [
        "embed-v-4-0",
        "cohere-embed-v-4-0",
        "cohere-embed-v4",
        "embed-v4.0",
    ],
    provider: "azure",
    publisher: "Cohere",
    category: "embedding",
    addedDate: new Date("2026-05-26").getTime(),
    priceMultiplier: 0.75,
    paidOnly: false,
    // Azure Cohere retail rates (Global).
    cost: {
        promptTextTokens: perMillion(0.12),
        promptImageTokens: perMillion(0.47),
    },
    title: "Cohere Embed v4",
    description:
        "Multilingual text and image vectors. 1536 dimensions, 128K context.",
    inputModalities: ["text", "image"],
    outputModalities: ["embedding"],
    contextLength: 128000,
} satisfies ModelDefinition;
