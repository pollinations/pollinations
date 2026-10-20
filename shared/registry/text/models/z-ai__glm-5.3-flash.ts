import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "z-ai/glm-5.3-flash";

export default {
    supportedParameters: CHAT_PARAMETERS.fireworksReasoning,
    aliases: [],
    provider: "fireworks",
    publisher: "Z.ai",
    category: "text",
    addedDate: new Date("2026-08-27").getTime(),
    paidOnly: false,
    priceMultiplier: 1,
    // Fireworks standard serverless rates (2026-10-12).
    cost: {
        promptTextTokens: perMillion(0.15),
        promptCachedTokens: perMillion(0.03),
        promptImageTokens: perMillion(0.15),
        completionTextTokens: perMillion(0.5),
    },
    title: "Z.ai GLM-5.3 Flash",
    description:
        "Low-cost million-token multimodal reasoning for agents and visual analysis",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
