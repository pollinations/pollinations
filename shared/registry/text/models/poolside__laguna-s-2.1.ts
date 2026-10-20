import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "poolside/laguna-s-2.1";

export default {
    supportedParameters: CHAT_PARAMETERS.laguna,
    aliases: ["laguna-s-2.1", "laguna-s2.1", "poolside-laguna-s-2.1", "laguna"],
    provider: "openrouter",
    publisher: "Poolside",
    category: "text",
    addedDate: new Date("2026-07-22").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Poolside route rates (2026-08-22).
        promptTextTokens: perMillion(0.09) * 1.055,
        promptCachedTokens: perMillion(0.009) * 1.055,
        completionTextTokens: perMillion(0.18) * 1.055,
    },
    title: "Laguna S 2.1",
    description:
        "Long-context reasoning for coding agents and complex software tasks",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
