import type { ModelDefinition } from "../../registry";
export const id = "black-forest-labs/flux.2-max";

export default {
    aliases: [],
    provider: "replicate",
    publisher: "Black Forest Labs",
    category: "image",
    addedDate: new Date("2026-09-13").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // Replicate pricing, verified 2026-09-13: $0.04/run execution fee
    // plus $0.03 per input and per output megapixel.
    cost: {
        promptImageTokens: 0.03,
        completionImageTokens: 0.03,
    },
    priceUnits: {
        promptImageTokens: { unit: "megapixel" },
        completionImageTokens: { unit: "megapixel" },
    },
    billing: {
        adjustments: [
            {
                id: "replicate.flux_2_max.run.v1",
                description: "Replicate FLUX.2 Max execution fee",
                kind: "image",
                unit: "generation",
                unitCost: 0.04,
                publicPricing: {
                    label: "Execution fee",
                    quantity: 1,
                    unit: "generation",
                },
                countUnits: () => 1,
            },
        ],
    },
    title: "FLUX.2 Max",
    description:
        "Flagship-tier generation and multi-reference editing with the highest consistency and prompt adherence in the FLUX.2 line",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 8, // Replicate and OpenRouter both cap the API at 8 reference images.
} satisfies ModelDefinition;
