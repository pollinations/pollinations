import type { ModelDefinition } from "./registry";

/**
 * Fallback-only routes for the public image models in `image.ts`.
 *
 * Ordinary registry entries — same shape, same pricing and tracking path — but
 * never selected directly: a public model names them in its `fallbacks` list
 * and `hidden: true` keeps them out of /models, the dashboard, filenames and
 * EXIF. The caller keeps the public model's identity and price; these entries
 * exist to record the real provider and its cost.
 */
export const IMAGE_FALLBACK_SERVICES = {
    "zimage-fal": {
        aliases: [],
        provider: "fal",
        brand: "Alibaba",
        category: "image",
        addedDate: new Date("2026-08-10").getTime(),
        paidOnly: true,
        hidden: true,
        priceMultiplier: 1,
        // Fal bills $0.005 per output megapixel. The token line stays at zero;
        // the adjustment below records the exact provider cost while the
        // caller keeps the public zimage flat price when this serves as fallback.
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
        title: "Z-Image Turbo",
        description:
            "Instant, budget-friendly images with crisp upscaled output",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
} as const satisfies Record<string, ModelDefinition>;
