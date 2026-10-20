import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "openai/gpt-image-2";

export default {
    aliases: ["gpt-image-2"],
    provider: "azure",
    publisher: "OpenAI",
    category: "image",
    addedDate: new Date("2026-04-22").getTime(),
    // Provider retires this route on 2027-10-21.
    paidOnly: false,
    priceMultiplier: 0.75,
    cost: {
        promptTextTokens: perMillion(5), // per 1M tokens
        promptCachedTokens: perMillion(1.25), // per 1M tokens
        promptImageTokens: perMillion(8), // per 1M tokens
        completionImageTokens: perMillion(30), // per 1M tokens
    },
    title: "GPT Image 2",
    description:
        "Premium high-resolution images with excellent prompt following",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 16, // GPT Image edit endpoint accepts up to 16 input images.
} satisfies ModelDefinition;
