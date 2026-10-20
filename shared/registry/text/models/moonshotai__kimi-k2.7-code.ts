import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "moonshotai/kimi-k2.7-code";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterKimiMoonshot,
    aliases: ["kimi-k2.7-code", "kimi-k2.7", "kimi-k2p7", "kimi-code"],
    provider: "openrouter",
    publisher: "Moonshot AI",
    category: "text",
    addedDate: new Date("2026-06-12").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Moonshot AI int4 rates (2026-09-23), including the
        // account's 5.5% credit-purchase fee.
        promptTextTokens: perMillion(0.95) * 1.055,
        promptCachedTokens: perMillion(0.19) * 1.055,
        promptCacheWriteTokens: perMillion(0.95) * 1.055,
        promptImageTokens: perMillion(0.95) * 1.055,
        completionTextTokens: perMillion(4.0) * 1.055,
    },
    title: "Moonshot Kimi K2.7 Code",
    description:
        "Built for agentic coding — plans, reasons and edits code step by step",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 30,
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
