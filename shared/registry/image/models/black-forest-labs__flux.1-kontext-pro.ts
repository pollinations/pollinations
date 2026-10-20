import type { ModelDefinition } from "../../registry";
export const id = "black-forest-labs/flux.1-kontext-pro";

export default {
    aliases: ["kontext"],
    provider: "azure",
    publisher: "Black Forest Labs",
    category: "image",
    addedDate: new Date("2025-10-07").getTime(),
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        completionImageTokens: 0.04, // per image
    },
    title: "FLUX.1 Kontext Pro",
    description:
        "Edits an existing image from plain instructions — swap, restyle, refine",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 1, // Azure FLUX.1 Kontext edit route forwards one input image.
} satisfies ModelDefinition;
