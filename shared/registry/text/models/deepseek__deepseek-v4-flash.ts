import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "deepseek/deepseek-v4-flash";

export default {
    supportedParameters: CHAT_PARAMETERS.azureOpenReasoning,
    aliases: [
        "deepseek-v4",
        "deepseek-v4-flash",
        "deepseek-v4-lite",
        "deepseek-lite",
        "deepseek-flash",
        "deepseek",
    ],
    provider: "azure",
    publisher: "DeepSeek",
    category: "text",
    addedDate: new Date("2025-10-10").getTime(),
    // Azure model catalog and retirement schedule (Preview).
    // Provider retires this route on 2026-12-03.
    priceMultiplier: 0.75,
    paidOnly: false,
    perUserRpm: 60,
    cost: {
        // Azure Global Standard "V4 Flash 0731" meters (2026-09-23).
        promptTextTokens: perMillion(0.44),
        promptCachedTokens: perMillion(0.014),
        completionTextTokens: perMillion(1.32),
    },
    title: "DeepSeek V4 Flash 0731",
    description: "Fast reasoning and coding at bargain prices",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
