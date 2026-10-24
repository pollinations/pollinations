import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "meta/muse-wonder-1.0";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterMuseWonder,
    aliases: [],
    provider: "openrouter",
    publisher: "Meta",
    category: "text",
    addedDate: new Date("2026-10-12").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // OpenRouter Meta endpoint (2026-10-12), including the 5.5%
    // credit-purchase fee.
    cost: {
        promptTextTokens: perMillion(4) * 1.055,
        promptCachedTokens: perMillion(0.2) * 1.055,
        promptImageTokens: perMillion(4) * 1.055,
        completionTextTokens: perMillion(20) * 1.055,
    },
    title: "Muse Wonder 1.0",
    description:
        "Long-running agent and coding model with 1M context and image input",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
