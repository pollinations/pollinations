import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "meta/muse-glimmer-30b";

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    aliases: ["muse-glimmer"],
    provider: "deepinfra",
    publisher: "Meta",
    category: "text",
    addedDate: new Date("2026-08-14").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    perUserRpm: 60,
    cost: {
        // DeepInfra rates (2026-09-23).
        promptTextTokens: perMillion(0.3),
        promptCachedTokens: perMillion(0.04),
        promptImageTokens: perMillion(0.3),
        completionTextTokens: perMillion(1.2),
    },
    title: "Muse Glimmer 30B",
    description:
        "Compact multimodal agent for reasoning, tool use and failure recovery",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 30,
    tools: true,
    reasoning: true,
    contextLength: 131072,
    isSpecialized: false,
} satisfies ModelDefinition;
