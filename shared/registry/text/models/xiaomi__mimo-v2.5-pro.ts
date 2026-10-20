import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "xiaomi/mimo-v2.5-pro";

export default {
    supportedParameters: CHAT_PARAMETERS.mimo,
    aliases: ["mimo-pro", "mimo-2.5-pro", "mimo-v2.5-pro"],
    provider: "openrouter",
    publisher: "Xiaomi",
    category: "text",
    addedDate: new Date("2026-07-18").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Xiaomi FP8 endpoint, verified 2026-08-22.
        promptTextTokens: perMillion(0.435) * 1.055,
        promptCachedTokens: perMillion(0.0036) * 1.055,
        completionTextTokens: perMillion(0.87) * 1.055,
    },
    title: "MiMo V2.5 Pro",
    description: "Long-context reasoning and coding with higher capability",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
