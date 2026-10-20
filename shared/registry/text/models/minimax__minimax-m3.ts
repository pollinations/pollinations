import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "minimax/minimax-m3";

export default {
    supportedParameters: CHAT_PARAMETERS.fireworksReasoning,
    aliases: ["minimax-m3", "minimax3", "minimax-3", "minimax"],
    provider: "fireworks",
    publisher: "MiniMax",
    category: "text",
    addedDate: new Date("2026-06-02").getTime(),
    priceMultiplier: 1,
    paidOnly: false,
    perUserRpm: 60,
    cost: {
        // Fireworks accounts/fireworks/models/minimax-m3 rates (2026-06-14):
        // prompt $0.30/M, completion $1.20/M, cache read $0.06/M.
        promptTextTokens: perMillion(0.3),
        promptCachedTokens: perMillion(0.06),
        completionTextTokens: perMillion(1.2),
    },
    title: "MiniMax M3",
    description:
        "Strong coding and agent skills with a very long memory for big projects",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 30, // Fireworks vision hard limit.
    tools: true,
    reasoning: true,
    contextLength: 524288,
    isSpecialized: false,
} satisfies ModelDefinition;
