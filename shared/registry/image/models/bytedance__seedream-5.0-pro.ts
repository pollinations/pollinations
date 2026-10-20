import type { ModelDefinition } from "../../registry";
export const id = "bytedance/seedream-5.0-pro";

export default {
    aliases: ["seedream-5-pro", "seedream-pro-5", "seedream5-pro"],
    provider: "replicate",
    publisher: "ByteDance",
    category: "image",
    addedDate: new Date("2026-07-10").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionImageTokens: 0.09, // per 2K image
    },
    title: "Seedream 5.0 Pro",
    description: "Premium multimodal image generation and editing",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 10,
} satisfies ModelDefinition;
