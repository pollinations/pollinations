import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "nvidia/nemotron-3-ultra";

export default {
    supportedParameters: CHAT_PARAMETERS.fireworksReasoning,
    aliases: [
        "nemotron-3-ultra",
        "nvidia-nemotron-3-ultra",
        "nemotron-3-ultra-550b-a55b",
        "nemotron",
    ],
    provider: "fireworks",
    publisher: "NVIDIA",
    category: "text",
    addedDate: new Date("2026-07-27").getTime(),
    paidOnly: false,
    priceMultiplier: 1,
    cost: {
        // Fireworks NVFP4 serverless rates (2026-09-30).
        promptTextTokens: perMillion(0.6),
        promptCachedTokens: perMillion(0.12),
        completionTextTokens: perMillion(2.4),
    },
    title: "NVIDIA Nemotron 3 Ultra",
    description:
        "Frontier reasoning for coding agents, deep research and complex workflows",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
