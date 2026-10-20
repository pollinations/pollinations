import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "openai/gpt-image-1-mini";

export default {
    aliases: ["gpt-image", "gpt-image-1-mini", "gptimage"],
    provider: "azure",
    publisher: "OpenAI",
    category: "image",
    addedDate: new Date("2025-10-10").getTime(),
    // Provider retires this route on 2027-04-07.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(2.0), // per 1M tokens
        promptCachedTokens: perMillion(0.2), // per 1M tokens
        promptImageTokens: perMillion(2.5), // per 1M tokens
        completionImageTokens: perMillion(8), // per 1M tokens
    },
    title: "GPT Image 1 Mini",
    description: "Affordable image creation and editing for everyday use",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 16, // GPT Image edit endpoint accepts up to 16 input images.
    supportsTransparency: true,
} satisfies ModelDefinition;
