import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "deepseek/deepseek-v4.1-flash";

export default {
    // Azure accepts this full set (probed 2026-10-15).
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    aliases: [],
    provider: "azure",
    publisher: "DeepSeek",
    category: "text",
    addedDate: new Date("2026-09-11").getTime(),
    // Azure model catalog and retirement schedule (Preview).
    // Provider retires this route on 2026-12-15.
    // 0.5x keeps output at the pre-Azure DeepInfra price.
    priceMultiplier: 0.5,
    paidOnly: false,
    perUserRpm: 60,
    cost: {
        // Azure Global Standard "V4.1 Flash" catalog rates (2026-10-15).
        promptTextTokens: perMillion(0.3),
        promptCachedTokens: perMillion(0.006),
        promptImageTokens: perMillion(0.3),
        completionTextTokens: perMillion(1.2),
    },
    title: "DeepSeek V4.1 Flash",
    description: "Reasoning, coding, tool calling, and image understanding.",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
