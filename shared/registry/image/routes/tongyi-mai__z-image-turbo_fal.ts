import type { FallbackDefinition } from "../../merge-fallbacks";
export const id = "tongyi-mai/z-image-turbo:fal";
export const parent = "tongyi-mai/z-image-turbo";
export const order = 0;

export default {
    provider: "fal",
    addedDate: new Date("2026-08-10").getTime(),
    // Fal bills $0.005 per output megapixel, rounded up per image; the
    // handler passes fal's reported count as `megapixels`. The token
    // line stays at zero; the adjustment below records the exact
    // provider cost while the caller keeps the public zimage flat price.
    cost: {
        completionImageTokens: 0,
    },
    billing: {
        adjustments: [
            {
                id: "fal.zimage.output_megapixels.v1",
                description: "Fal output image megapixels",
                kind: "image",
                unit: "megapixel",
                unitCost: 0.005,
                publicPricing: {
                    label: "Output megapixels",
                    quantity: 1,
                    unit: "megapixel",
                },
                countUnits: (_output, input) =>
                    Math.max(0, input?.megapixels ?? 0),
            },
        ],
    },
} satisfies FallbackDefinition;
