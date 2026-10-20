import type { ModelDefinition } from "../../registry";
export const id = "inferenceport-ai/lightning-image-turbo";

export default {
    aliases: [],
    provider: "inferenceport",
    publisher: "InferencePort",
    category: "image",
    addedDate: new Date("2026-09-12").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    perUserRpm: 15,
    cost: {
        completionImageTokens: 0.02, // per image
    },
    title: "Lightning Image Turbo",
    description:
        "Image generation with up to two reference images for visual guidance",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 2,
} satisfies ModelDefinition;
