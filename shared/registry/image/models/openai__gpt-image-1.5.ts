import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "openai/gpt-image-1.5";

export default {
    aliases: ["gpt-image-1.5", "gpt-image-large", "gptimage-large"],
    provider: "azure",
    publisher: "OpenAI",
    category: "image",
    addedDate: new Date("2025-12-23").getTime(),
    // Provider retires this route on 2026-12-16.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        // Official pricing: https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-openai%E2%80%99s-gpt-image-1-5-in-microsoft-foundry/4478139
        promptTextTokens: perMillion(5), // per 1M tokens
        promptCachedTokens: perMillion(1.25), // per 1M tokens
        promptImageTokens: perMillion(8), // per 1M tokens
        completionTextTokens: perMillion(10), // per 1M tokens
        completionImageTokens: perMillion(32), // per 1M tokens
    },
    title: "GPT Image 1.5",
    description: "High-fidelity image generation and editing with fine detail",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 16, // GPT Image edit endpoint accepts up to 16 input images.
    supportsTransparency: true,
} satisfies ModelDefinition;
