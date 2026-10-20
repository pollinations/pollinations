import type { ModelDefinition } from "../../registry";
export const id = "x-ai/grok-imagine-image-quality";

export default {
    aliases: [
        "grok-aurora",
        "aurora",
        "grok-imagine-image-quality",
        "grok-imagine-image-pro",
        "grok-imagine-pro",
    ],
    provider: "openrouter",
    publisher: "xAI",
    category: "image",
    addedDate: new Date("2026-03-23").getTime(),
    // xAI retires the slug and redirects it to grok-imagine-image-2.0.
    // Provider retires this route on 2026-11-02.
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        promptImageTokens: 0.01 * 1.055, // per input image on edits
        completionImageTokens: 0.05 * 1.055, // per 1K image
    },
    title: "Grok Imagine Pro",
    description: "Higher-fidelity photorealistic images for polished results",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 3, // OpenRouter input_references limit.
} satisfies ModelDefinition;
