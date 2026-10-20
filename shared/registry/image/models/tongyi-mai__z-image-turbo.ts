import type { ModelDefinition } from "../../registry";
export const id = "tongyi-mai/z-image-turbo";

export default {
    aliases: ["z-image", "z-image-turbo", "zimage"],
    provider: "vast",
    publisher: "Alibaba",
    category: "image",
    addedDate: new Date("2025-12-08").getTime(),
    priceMultiplier: 1,
    paidOnly: false,
    perUserRpm: 60,
    cost: {
        completionImageTokens: 0.004, // per image
    },
    title: "Z-Image Turbo",
    description: "Instant, budget-friendly images with crisp upscaled output",
    inputModalities: ["text"],
    outputModalities: ["image"],
} satisfies ModelDefinition;
