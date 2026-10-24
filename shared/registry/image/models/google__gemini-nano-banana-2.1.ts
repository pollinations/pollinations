import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "google/gemini-nano-banana-2.1";

export default {
    aliases: [],
    provider: "openrouter",
    publisher: "Google",
    category: "image",
    addedDate: new Date("2026-10-06").getTime(),
    paidOnly: true,
    priceMultiplier: 1.055,
    cost: {
        // Google AI Studio via OpenRouter, including the 5.5% credit fee.
        promptTextTokens: perMillion(1.5) * 1.055, // per 1M tokens
        promptImageTokens: perMillion(1.5) * 1.055, // per 1M tokens
        completionTextTokens: perMillion(7.5) * 1.055, // text/reasoning output tokens
        completionImageTokens: perMillion(30) * 1.055, // per 1M tokens
    },
    title: "Nano Banana 2.1",
    description: "Balanced image generation and editing with output up to 2K",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 14, // Gemini Nano Banana 2.1 provider limit.
} satisfies ModelDefinition;
