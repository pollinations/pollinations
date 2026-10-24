import type { ModelDefinition } from "../../registry";
export const id = "nvidia/asset-harvester";

export default {
    aliases: [],
    publisher: "NVIDIA",
    provider: "inferenceport",
    category: "3d",
    addedDate: new Date("2026-09-07").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    flatRate: true,
    cost: {
        // InferencePort list price, $0.25 per generation (docs.inferenceport.ai
        // p2g-api pricing table and the authenticated /v1/models catalog).
        completionImageTokens: 0.25,
    },
    title: "NVIDIA Asset Harvester",
    description: "Image-to-3D Gaussian Splat (PLY)",
    inputModalities: ["image"],
    outputModalities: ["3d"],
    maxReferenceImages: 1,
} satisfies ModelDefinition;
