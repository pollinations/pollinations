import type { ModelDefinition } from "../../registry";
export const id = "black-forest-labs/flux.1-schnell";

export default {
    aliases: ["flux"],
    provider: "vast",
    publisher: "Black Forest Labs",
    category: "image",
    addedDate: new Date("2025-10-07").getTime(),
    priceMultiplier: 1,
    paidOnly: false,
    perUserRpm: 60,
    cost: {
        completionImageTokens: 0.002, // per image
    },
    title: "FLUX.1 Schnell",
    description: "Fast, high-quality images at a tiny cost",
    inputModalities: ["text"],
    outputModalities: ["image"],
} satisfies ModelDefinition;
