import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "thinkingmachines/inkling";

export default {
    supportedParameters: CHAT_PARAMETERS.fireworksReasoning,
    aliases: [],
    provider: "fireworks",
    publisher: "Thinking Machines",
    category: "text",
    addedDate: new Date("2026-08-30").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // Fireworks standard serverless rates (2026-08-30).
    cost: {
        promptTextTokens: perMillion(1),
        promptCachedTokens: perMillion(0.17),
        promptAudioTokens: perMillion(1),
        promptImageTokens: perMillion(1),
        completionTextTokens: perMillion(4.05),
    },
    title: "Inkling",
    description:
        "Flagship million-token multimodal reasoning for agents, coding, visual analysis and audio understanding",
    inputModalities: ["text", "image", "audio"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
