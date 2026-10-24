import type { ModelDefinition } from "../../registry";
export const id = "bytedance/seedream-4.0";

export default {
    aliases: ["seedream"],
    provider: "replicate",
    publisher: "ByteDance",
    category: "image",
    addedDate: new Date("2025-10-07").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionImageTokens: 0.03, // per image
    },
    title: "Seedream 4.0",
    description: "Photorealistic images with strong prompt adherence",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 10, // Pollinations route cap from Replicate schema.
} satisfies ModelDefinition;
