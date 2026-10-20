import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "xiaomi/mimo-v2.5";

export default {
    supportedParameters: CHAT_PARAMETERS.mimo,
    aliases: ["mimo", "mimo-2.5", "mimo-v2.5"],
    provider: "openrouter",
    publisher: "Xiaomi",
    category: "text",
    addedDate: new Date("2026-07-18").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        promptTextTokens: perMillion(0.14) * 1.055,
        promptCachedTokens: perMillion(0.0028) * 1.055,
        completionTextTokens: perMillion(0.28) * 1.055,
    },
    title: "MiMo V2.5",
    description: "Efficient multimodal reasoning for agents and coding",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
