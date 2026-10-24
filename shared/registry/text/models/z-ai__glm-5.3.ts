import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "z-ai/glm-5.3";

export default {
    supportedParameters: CHAT_PARAMETERS.fireworksReasoning,
    aliases: ["glm-5.3"],
    provider: "fireworks",
    publisher: "Z.ai",
    category: "text",
    addedDate: new Date("2026-08-19").getTime(),
    paidOnly: false,
    priceMultiplier: 1,
    // Fireworks standard serverless rates (2026-08-29).
    cost: {
        promptTextTokens: perMillion(1.4),
        promptCachedTokens: perMillion(0.26),
        completionTextTokens: perMillion(4.4),
    },
    title: "Z.ai GLM-5.3",
    description:
        "Mandatory-reasoning model for complex software engineering and long-horizon agent workflows",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
