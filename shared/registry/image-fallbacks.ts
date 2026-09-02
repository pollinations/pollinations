import { defineCostVariants, matchResolution } from "./cost-variants";
import type { FallbackMap } from "./merge-fallbacks";

/**
 * Fallback routes for the image catalog, keyed by the model they serve and
 * then by the id each route is registered under. A route states only what
 * differs from that model; mergeFallbacks fills in the rest. See
 * `FallbackDefinition`.
 */
export const IMAGE_FALLBACKS = {
    "black-forest-labs/flux.1-kontext-pro": {
        "black-forest-labs/flux.1-kontext-pro:fallback": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "black-forest-labs/flux.2-pro": {
        "black-forest-labs/flux.2-pro:fallback": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "qwen/qwen-image-3": {
        "qwen/qwen-image-3:fallback": {
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
    "prunaai/p-image-edit": {
        "prunaai/p-image-edit:fallback": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "google/gemini-3.1-flash-image": {
        "google/gemini-3.1-flash-image:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "google/gemini-3-pro-image": {
        "google/gemini-3-pro-image:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "black-forest-labs/flux.1-schnell": {
        "black-forest-labs/flux.1-schnell:fallback": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: { completionImageTokens: 0.0005 },
        },
    },
    "krea/krea-2-medium": {
        "krea/krea-2-medium:fallback": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "bytedance/seedream-5.0-lite": {
        "bytedance/seedream-5.0-lite:fallback": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
            maxReferenceImages: 10,
        },
    },
    "x-ai/grok-imagine-video": {
        "x-ai/grok-imagine-video:fallback": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "x-ai/grok-imagine-video-1.5": {
        "x-ai/grok-imagine-video-1.5:fallback": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "alibaba/wan-2.6": {
        "alibaba/wan-2.6:fallback": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "bytedance/seedance-1-pro-fast": {
        "bytedance/seedance-1-pro-fast:fallback": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
            cost: { completionVideoSeconds: 0.0216 },
            ...defineCostVariants(
                {
                    "480p": { completionVideoSeconds: 0.0096 },
                    "1080p": { completionVideoSeconds: 0.0486 },
                },
                matchResolution("480p", "1080p"),
                {
                    "480p": {
                        label: "480p",
                        description:
                            "Applies when the requested video resolution is 480p.",
                    },
                    "1080p": {
                        label: "1080p",
                        description:
                            "Applies when the requested video resolution is 1080p.",
                    },
                },
                "720p",
            ),
        },
    },
    "tongyi-mai/z-image-turbo": {
        "tongyi-mai/z-image-turbo:fallback": {
            provider: "fal",
            addedDate: new Date("2026-08-10").getTime(),
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
