import type { FallbackDefinition } from "../../merge-fallbacks";
export const id = "black-forest-labs/flux.2-pro:replicate";
export const parent = "black-forest-labs/flux.2-pro";
export const order = 0;

export default {
    provider: "replicate",
    addedDate: new Date("2026-09-01").getTime(),
    billing: {
        adjustments: [
            {
                id: "replicate.flux_2_pro.run.v1",
                description: "Replicate FLUX.2 Pro execution fee",
                kind: "image",
                unit: "generation",
                unitCost: 0.015,
                publicPricing: {
                    label: "Execution fee",
                    quantity: 1,
                    unit: "generation",
                },
                countUnits: () => 1,
            },
        ],
    },
} satisfies FallbackDefinition;
