import type { ModelDefinition } from "../../registry";
export const id = "qwen/qwen-image-2.1-turbo";

export default {
    aliases: [],
    provider: "alibaba",
    publisher: "Qwen",
    category: "image",
    addedDate: new Date("2026-10-11").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // Alibaba Singapore (International) list price (2026-10-13): $0.016 per
    // output image, whatever the reference image count.
    cost: {
        completionImageTokens: 0.016, // per image
    },
    title: "Qwen Image 2.1 Turbo",
    description:
        "Low-cost generation and editing with up to 10 reference images",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 10,
} satisfies ModelDefinition;
