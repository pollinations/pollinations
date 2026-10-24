import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-5.4-mini";

export default {
    supportedParameters: CHAT_PARAMETERS.azureGptMini,
    aliases: ["gpt-5-mini", "openai-mini", "gpt-5.4-mini"],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2026-05-15").getTime(),
    // Provider retires this route on 2027-09-21.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0.75),
        promptCachedTokens: perMillion(0.075),
        completionTextTokens: perMillion(4.5),
    },
    title: "GPT-5.4 Mini",
    description:
        "Strong all-round quality at mid cost; a good default when speed matters",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10, // Azure OpenAI vision limit: 10 images/chat request (provider cap).
    tools: true,
    reasoning: true,
    contextLength: 400000,
    isSpecialized: false,
} satisfies ModelDefinition;
