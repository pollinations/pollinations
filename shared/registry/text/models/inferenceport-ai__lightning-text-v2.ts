import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "inferenceport-ai/lightning-text-v2";

export default {
    supportedParameters: CHAT_PARAMETERS.inferenceportLightning,
    aliases: [],
    provider: "inferenceport",
    publisher: "InferencePort",
    category: "text",
    addedDate: new Date("2026-10-02").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // InferencePort /v1/models list price (2026-10-02): $0.75 per
        // million input and output tokens, no cache discount.
        promptTextTokens: perMillion(0.75),
        completionTextTokens: perMillion(0.75),
    },
    title: "Lightning Text v2",
    description:
        "Router that picks a fast model per prompt, with image input, tools and JSON output",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: false,
    contextLength: 128000,
    isSpecialized: false,
} satisfies ModelDefinition;
