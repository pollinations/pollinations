import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "amazon/nova-micro-v1";

export default {
    supportedParameters: CHAT_PARAMETERS.nova,
    aliases: ["amazon-nova-micro", "nova-micro", "nova-fast"],
    provider: "aws",
    publisher: "Amazon",
    category: "text",
    addedDate: new Date("2025-10-07").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        promptTextTokens: perMillion(0.035),
        // Bedrock Nova prompt caching: writes are free ($0 SKU), reads
        // bill at 25% of input (AWS Price List API, verified 2026-07-05).
        promptCachedTokens: perMillion(0.00875),
        promptCacheWriteTokens: perMillion(0),
        completionTextTokens: perMillion(0.14),
    },
    title: "Nova Micro",
    description:
        "Instant, ultra-cheap replies for simple tasks; not a deep thinker",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    contextLength: 128000,
    isSpecialized: false,
} satisfies ModelDefinition;
