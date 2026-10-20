import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "x-ai/grok-4.3";

export default {
    supportedParameters: CHAT_PARAMETERS.azureGrokReasoning,
    aliases: ["grok-4.3", "grok-4-3", "grok-reasoning", "grok-large"],
    provider: "azure",
    publisher: "xAI",
    category: "text",
    addedDate: new Date("2026-05-26").getTime(),
    // Provider retires this route on 2027-05-12.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(1.25),
        promptCachedTokens: perMillion(0.2),
        promptImageTokens: perMillion(1.25),
        completionTextTokens: perMillion(2.5),
    },
    title: "Grok 4.3",
    description:
        "Strong multimodal reasoning with a huge context window at a friendly price",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    // The selected Azure deployment caps prompts at 200K; xAI direct's 1M
    // window and 200K+ price tier do not apply to this route.
    contextLength: 200000,
    isSpecialized: false,
} satisfies ModelDefinition;
