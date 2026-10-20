import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "google/gemini-3-pro-image";

export default {
    aliases: ["nanobanana-pro"],
    provider: "google",
    publisher: "Google",
    category: "image",
    addedDate: new Date("2025-12-01").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Gemini 3 Pro Image via Vertex AI
        // 1K/2K image: 1120 tokens = $0.134/image ($120/M tokens)
        // 4K image: 2000 tokens = $0.24/image
        promptTextTokens: perMillion(2), // per 1M tokens
        promptImageTokens: perMillion(2), // per 1M tokens
        completionTextTokens: perMillion(12), // text/reasoning output tokens
        completionImageTokens: perMillion(120), // per 1M tokens, 1120 tokens per 1K image
    },
    title: "Nano Banana Pro",
    description:
        "Studio-quality images up to 4K, with reasoning for tricky prompts",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 14, // Gemini 3 Pro Image provider limit.
} satisfies ModelDefinition;
