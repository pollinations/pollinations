import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.8-2.4t-a95b";

export default {
    supportedParameters: CHAT_PARAMETERS.fireworksReasoning,
    aliases: ["qwen3.8-2.4t-a95b"],
    provider: "fireworks",
    publisher: "Qwen",
    category: "text",
    addedDate: new Date("2026-08-14").getTime(),
    paidOnly: false,
    priceMultiplier: 1,
    cost: {
        // Fireworks accounts/fireworks/models/qwen3p8-2p4t-a95b rates (2026-08-14).
        promptTextTokens: perMillion(2),
        promptCachedTokens: perMillion(0.25),
        completionTextTokens: perMillion(6),
    },
    title: "Qwen3.8 2.4T A95B",
    description:
        "Open-weight sparse frontier reasoning for long-horizon coding and autonomous agents",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
