import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "minimax/minimax-m2.7";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterMinimax27,
    aliases: ["minimax-m2p7", "minimax-m2.5", "minimax-m2p5", "minimax-m2.7"],
    provider: "openrouter",
    publisher: "MiniMax",
    category: "text",
    addedDate: new Date("2026-01-06").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Novita FP8 rates (2026-09-23), including the
        // account's 5.5% credit-purchase fee.
        promptTextTokens: perMillion(0.27) * 1.055,
        promptCachedTokens: perMillion(0.054) * 1.055,
        completionTextTokens: perMillion(1.08) * 1.055,
    },
    title: "MiniMax M2.7",
    description: "Multilingual coding and agent tasks at a friendly price",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 200000,
    isSpecialized: false,
} satisfies ModelDefinition;
