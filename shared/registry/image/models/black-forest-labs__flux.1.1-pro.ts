import type { ModelDefinition } from "../../registry";
export const id = "black-forest-labs/flux.1.1-pro";

export default {
    aliases: [],
    provider: "azure",
    publisher: "Black Forest Labs",
    category: "image",
    addedDate: new Date("2026-09-23").getTime(),
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        completionImageTokens: 0.04, // Azure Global Standard, $40/1K images in East US and Sweden Central.
    },
    title: "FLUX 1.1 Pro",
    description:
        "Fast text-to-image generation with precise dimensions and reproducible seeds",
    inputModalities: ["text"],
    outputModalities: ["image"],
} satisfies ModelDefinition;
