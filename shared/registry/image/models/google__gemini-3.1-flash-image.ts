import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "google/gemini-3.1-flash-image";

export default {
    aliases: ["nanobanana2", "nanobanana-2"],
    provider: "google",
    publisher: "Google",
    category: "image",
    addedDate: new Date("2026-02-27").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Gemini 3.1 Flash Image via Vertex AI
        promptTextTokens: perMillion(0.5), // per 1M tokens
        promptImageTokens: perMillion(0.5), // per 1M tokens
        completionTextTokens: perMillion(3), // text/reasoning output tokens
        completionImageTokens: perMillion(60), // per 1M tokens, 2520 tokens/image
    },
    title: "Nano Banana 2",
    description:
        "Sharper detail and better text rendering in generated and edited images",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 14, // Pollinations cap for Gemini 3.1 Flash Image route.
} satisfies ModelDefinition;
