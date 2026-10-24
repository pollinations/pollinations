import type { ModelDefinition } from "../../registry";
export const id = "black-forest-labs/flux.2-pro";

export default {
    aliases: ["flux-2-pro"],
    provider: "azure",
    publisher: "Black Forest Labs",
    category: "image",
    addedDate: new Date("2026-08-31").getTime(),
    priceMultiplier: 0.75,
    paidOnly: true,
    // Azure Global Standard pricing, verified 2026-08-31. Azure rounds
    // input and output megapixels up to whole billable units.
    cost: {
        promptImageTokens: 0.015,
        completionImageTokens: 0.015,
    },
    priceUnits: {
        promptImageTokens: { unit: "megapixel" },
        completionImageTokens: { unit: "megapixel" },
    },
    billing: {
        adjustments: [
            {
                id: "azure.flux_2_pro.initial_output_megapixel.v1",
                description: "FLUX.2 Pro initial output megapixel premium",
                kind: "image",
                unit: "generation",
                unitCost: 0.015,
                publicPricing: {
                    label: "Initial output megapixel premium",
                    quantity: 1,
                    unit: "generation",
                },
                countUnits: () => 1,
            },
        ],
    },
    title: "FLUX.2 Pro",
    description:
        "High-fidelity generation and multi-reference editing with strong prompt adherence",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 8, // Azure FLUX.2 Pro route limit.
} satisfies ModelDefinition;
