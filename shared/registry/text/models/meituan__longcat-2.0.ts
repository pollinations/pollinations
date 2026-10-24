import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "meituan/longcat-2.0";

export default {
    supportedParameters: CHAT_PARAMETERS.longcat,
    aliases: ["longcat-2.0", "longcat-2", "longcat"],
    provider: "openrouter",
    publisher: "Meituan",
    category: "text",
    addedDate: new Date("2026-07-23").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter AtlasCloud FP8 route rates (2026-07-23).
        promptTextTokens: perMillion(0.3) * 1.055,
        promptCachedTokens: perMillion(0.006) * 1.055,
        completionTextTokens: perMillion(1.2) * 1.055,
    },
    title: "LongCat 2.0",
    description:
        "Long-context reasoning for coding agents and repository-scale tasks",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
