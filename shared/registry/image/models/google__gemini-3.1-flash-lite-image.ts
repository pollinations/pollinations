import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "google/gemini-3.1-flash-lite-image";

export default {
    aliases: ["nanobanana2lite", "nanobanana-lite", "nanobanana-2-lite"],
    provider: "google",
    publisher: "Google",
    category: "image",
    addedDate: new Date("2026-06-30").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Gemini 3.1 Flash-Lite Image (GA) via Vertex AI — half of nanobanana-2
        promptTextTokens: perMillion(0.25), // per 1M tokens
        promptImageTokens: perMillion(0.25), // per 1M tokens
        completionTextTokens: perMillion(1.5), // text/reasoning output tokens
        completionImageTokens: perMillion(30), // per 1M tokens, 1120 tokens/1K image = $0.0336
    },
    title: "Nano Banana 2 Lite",
    description:
        "Speedy, affordable image generation and editing for everyday use",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 14, // Pollinations cap for Gemini 3.1 Flash-Lite Image route.
} satisfies ModelDefinition;
