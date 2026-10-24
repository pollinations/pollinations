import type { ModelDefinition } from "../../registry";
export const id = "hyper3d/rodin-2.5";

export default {
    aliases: ["rodin", "hyper3d-rodin"],
    provider: "fal",
    publisher: "Hyper3D",
    category: "3d",
    addedDate: new Date("2026-06-24").getTime(),
    priceMultiplier: 1,
    paidOnly: true, // fal.ai-served — restrict to paid balance
    flatRate: true,

    cost: {
        completionImageTokens: 0.1, // per generation
    },
    title: "Hyper3D Rodin 2.5",
    description: "Textured 3D models from an image or a text prompt",
    inputModalities: ["text", "image"],
    outputModalities: ["3d"],
    maxReferenceImages: 1,
} satisfies ModelDefinition;
