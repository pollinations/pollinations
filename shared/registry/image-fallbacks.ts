import type { FallbackMap } from "./merge-fallbacks";

/**
 * Fallback routes for the image catalog, keyed by the model they serve and
 * then by the id each route is registered under. A route states only what
 * differs from that model; mergeFallbacks fills in the rest. See
 * `FallbackDefinition`.
 */
export const IMAGE_FALLBACKS = {
    kontext: {
        "kontext-replicate": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "flux-2-pro": {
        "flux-2-pro-replicate": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "qwen-image-3": {
        "qwen-image-3-replicate": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptImageTokens: 0,
                completionImageTokens: 0.03,
            },
            costVariants: {
                "2k": {
                    promptImageTokens: 0,
                    completionImageTokens: 0.03,
                },
            },
        },
    },
    "p-image-edit": {
        "p-image-edit-replicate": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    zimage: {
        "zimage-fal": {
            provider: "fal",
            addedDate: new Date("2026-08-10").getTime(),
            paidOnly: true,
            // Fal bills $0.005 per output megapixel. The token line stays at
            // zero; the adjustment below records the exact provider cost while
            // the caller keeps the public zimage flat price.
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
        },
    },
} as const satisfies FallbackMap;
