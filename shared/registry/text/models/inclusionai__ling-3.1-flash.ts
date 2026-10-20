import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "inclusionai/ling-3.1-flash";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterLing31,
    aliases: [],
    provider: "novita",
    perUserRpm: 8,
    publisher: "inclusionAI",
    category: "text",
    addedDate: new Date("2026-10-02").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Novita's paid rate since its free launch promotion ended
        // (2026-10-13 16:00 UTC).
        promptTextTokens: perMillion(0.3),
        promptCachedTokens: perMillion(0.06),
        completionTextTokens: perMillion(0.9),
    },
    title: "Ling 3.1 Flash",
    description:
        "Hybrid reasoning mixture-of-experts for agentic workflows with tool use and long context",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
