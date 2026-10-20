import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "thinkingmachines/inkling-small";

export default {
    supportedParameters: CHAT_PARAMETERS.inklingSmall,
    aliases: ["inkling-small", "inkling-small-20260730", "inkling"],
    provider: "openrouter",
    publisher: "Thinking Machines",
    category: "text",
    addedDate: new Date("2026-08-01").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Together route rates (2026-08-01). Image and audio
        // inputs are tokenized into promptTextTokens; no separate usage is
        // reported or billed for either modality.
        promptTextTokens: perMillion(0.5) * 1.055,
        promptCachedTokens: perMillion(0.1) * 1.055,
        completionTextTokens: perMillion(1.2) * 1.055,
    },
    title: "Inkling Small",
    description:
        "Multimodal reasoning for agents, coding, image analysis and audio understanding",
    inputModalities: ["text", "image", "audio"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 524288,
    isSpecialized: false,
} satisfies ModelDefinition;
