import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "z-ai/glm-5.2";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterGlmFlashx,
    aliases: ["glm-5.2", "glm-5p2", "glm"],
    provider: "openrouter",
    publisher: "Z.ai",
    category: "text",
    addedDate: new Date("2026-01-06").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Z.AI FP8 rates (2026-09-23), including the account's
        // 5.5% credit-purchase fee.
        promptTextTokens: perMillion(1.4) * 1.055,
        promptCachedTokens: perMillion(0.26) * 1.055,
        completionTextTokens: perMillion(4.4) * 1.055,
    },
    title: "Z.ai GLM-5.2",
    description:
        "Massive open-weight model for long-context reasoning and agent workflows",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
