import type { ModelDefinition } from "../../registry";
export const id = "bytedance/seedream-4.5";

export default {
    aliases: ["seedream-pro"],
    provider: "openrouter",
    publisher: "ByteDance",
    category: "image",
    addedDate: new Date("2025-12-04").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionImageTokens: 0.04 * 1.055, // per image
    },
    title: "Seedream 4.5",
    description: "Premium photorealism for lifelike scenes and portraits",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 14, // Pollinations route cap from OpenRouter schema.
} satisfies ModelDefinition;
