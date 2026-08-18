import type { FallbackDefinition } from "./merge-fallbacks";

/**
 * Fallback targets for the image catalog, keyed by the model they serve and
 * tried in order. A route states only what differs from that model and is
 * registered as `<model>-<provider>-fallback-<n>`; mergeFallbacks fills in the
 * rest. See `FallbackDefinition`.
 */
export const IMAGE_FALLBACKS = {
    zimage: [
        {
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
    ],
} as const satisfies Record<string, readonly FallbackDefinition[]>;
