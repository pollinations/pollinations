import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "amazon/nova-2-lite-v1";

export default {
    supportedParameters: CHAT_PARAMETERS.nova,
    aliases: ["nova-2-lite", "amazon-nova-2-lite", "nova-2", "nova"],
    provider: "aws",
    publisher: "Amazon",
    category: "text",
    addedDate: new Date("2026-03-23").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        promptTextTokens: perMillion(0.33),
        // Bedrock Nova prompt caching: writes are free ($0 SKU), reads
        // bill at 25% of input (AWS Price List API, verified 2026-07-05).
        promptCachedTokens: perMillion(0.0825),
        promptCacheWriteTokens: perMillion(0),
        completionTextTokens: perMillion(2.75),
    },
    title: "Nova 2 Lite",
    description: "Budget-friendly reasoning with room for very long documents",
    inputModalities: ["text", "image", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Bedrock Converse image limit.
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
