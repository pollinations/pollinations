import type { ModelDefinition } from "../../registry";
export const id = "x-ai/grok-imagine-image";

export default {
    aliases: ["grok-imagine-image", "grok-imagine"],
    provider: "xai",
    publisher: "xAI",
    category: "image",
    addedDate: new Date("2026-02-25").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        promptImageTokens: 0.002, // per input image on edits
        completionImageTokens: 0.02, // per image
    },
    title: "Grok Imagine",
    description: "Photorealistic image generation and quick edits",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 5, // xAI image edits accept up to 5 `images`.
} satisfies ModelDefinition;
