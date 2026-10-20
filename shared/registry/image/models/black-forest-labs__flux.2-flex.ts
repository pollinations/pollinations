import type { ModelDefinition } from "../../registry";
export const id = "black-forest-labs/flux.2-flex";

export default {
    aliases: ["flux-2-flex"],
    provider: "azure",
    publisher: "Black Forest Labs",
    category: "image",
    addedDate: new Date("2026-08-31").getTime(),
    priceMultiplier: 0.75,
    paidOnly: true,
    // Azure Global Standard pricing, verified 2026-08-31. Azure rounds
    // input and output megapixels up to whole billable units.
    cost: {
        promptImageTokens: 0.05,
        completionImageTokens: 0.05,
    },
    priceUnits: {
        promptImageTokens: { unit: "megapixel" },
        completionImageTokens: { unit: "megapixel" },
    },
    title: "FLUX.2 Flex",
    description:
        "Typography-focused generation and multi-reference editing with adjustable prompt guidance",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 10,
} satisfies ModelDefinition;
