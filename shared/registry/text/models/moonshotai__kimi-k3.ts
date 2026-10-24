import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "moonshotai/kimi-k3";

export default {
    supportedParameters: CHAT_PARAMETERS.fireworksReasoning,
    aliases: ["kimi-k3"],
    provider: "fireworks",
    publisher: "Moonshot AI",
    category: "text",
    addedDate: new Date("2026-07-18").getTime(),
    paidOnly: false,
    priceMultiplier: 1,
    // Fireworks standard serverless rates (2026-07-30).
    cost: {
        promptTextTokens: perMillion(3),
        promptCachedTokens: perMillion(0.3),
        completionTextTokens: perMillion(15),
    },
    title: "Kimi K3",
    description: "Frontier multimodal model for coding and agents",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
