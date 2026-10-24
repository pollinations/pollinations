import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "nvidia/nemotron-3.5-lightning";

export default {
    supportedParameters: CHAT_PARAMETERS.fireworksReasoning,
    aliases: ["nemotron-3.5-lightning"],
    provider: "fireworks",
    publisher: "NVIDIA",
    category: "text",
    addedDate: new Date("2026-08-19").getTime(),
    paidOnly: false,
    priceMultiplier: 1,
    perUserRpm: 60,
    cost: {
        // Fireworks, verified 2026-08-19: $0.05/$0.01/$0.20 per million.
        promptTextTokens: perMillion(0.05),
        promptCachedTokens: perMillion(0.01),
        completionTextTokens: perMillion(0.2),
    },
    title: "NVIDIA Nemotron 3.5 Lightning",
    description:
        "Fast open-weight reasoning for high-volume agent tasks, tool use and structured output",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
