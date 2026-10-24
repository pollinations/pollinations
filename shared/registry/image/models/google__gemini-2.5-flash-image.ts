import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "google/gemini-2.5-flash-image";

export default {
    aliases: ["nanobanana"],
    provider: "google",
    publisher: "Google",
    category: "image",
    addedDate: new Date("2025-10-07").getTime(),
    // Vertex AI model page.
    // Provider retires this route on 2027-03-15.
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Gemini 2.5 Flash Image via Vertex AI
        promptTextTokens: perMillion(0.3), // per 1M tokens
        promptImageTokens: perMillion(0.3), // per 1M tokens
        completionTextTokens: perMillion(2.5), // text output tokens
        completionImageTokens: perMillion(30), // per 1M tokens, 1290 tokens/image
    },
    title: "Nano Banana",
    description:
        "Quick image generation and editing that follows instructions well",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 3, // Pollinations cap for Gemini 2.5 Flash Image route.
} satisfies ModelDefinition;
