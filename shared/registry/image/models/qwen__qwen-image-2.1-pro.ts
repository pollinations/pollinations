export const id = "qwen/qwen-image-2.1-pro";

export default {
    aliases: [],
    provider: "alibaba",
    publisher: "Qwen",
    category: "image",
    addedDate: new Date("2026-10-18").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // Alibaba Singapore (International) list price (2026-10-18): $0.04 per
    // output image. Beijing and the global regions list $0.035333.
    cost: {
        completionImageTokens: 0.04, // per image
    },
    title: "Qwen Image 2.1 Pro",
    description: "Generation and editing with up to 10 reference images",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 10,
} satisfies ModelDefinition;
