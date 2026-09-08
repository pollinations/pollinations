import { defineCostVariants, matchResolution } from "./cost-variants";
import type { FallbackMap } from "./merge-fallbacks";

/**
 * Fallback routes for the image catalog, keyed by the model they serve and
 * then by the id each route is registered under. A route states only what
 * differs from that model; mergeFallbacks fills in the rest. See
 * `FallbackDefinition`.
 */
export const IMAGE_FALLBACKS = {
    "openai/gpt-image-1-mini": {
        "openai/gpt-image-1-mini:openai": {
            provider: "openai",
            addedDate: new Date("2026-09-03").getTime(),
        },
    },
    "openai/gpt-image-1.5": {
        "openai/gpt-image-1.5:openai": {
            provider: "openai",
            addedDate: new Date("2026-09-03").getTime(),
        },
    },
    "openai/gpt-image-2": {
        "openai/gpt-image-2:openai": {
            provider: "openai",
            addedDate: new Date("2026-09-03").getTime(),
            perUserRpm: null,
        },
    },
    "black-forest-labs/flux.1-kontext-pro": {
        "black-forest-labs/flux.1-kontext-pro:replicate": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "black-forest-labs/flux.2-pro": {
        "black-forest-labs/flux.2-pro:replicate": {
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
        },
    },
    "qwen/qwen-image-3": {
        "qwen/qwen-image-3:replicate": {
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
        "prunaai/p-image-edit:replicate": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "google/gemini-3.1-flash-image": {
        "google/gemini-3.1-flash-image:openrouter:ai-studio": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "google/gemini-3-pro-image": {
        "google/gemini-3-pro-image:openrouter:vertex-global": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "black-forest-labs/flux.1-schnell": {
        "black-forest-labs/flux.1-schnell:deepinfra": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: { completionImageTokens: 0.0005 },
        },
    },
    "krea/krea-2-medium": {
        "krea/krea-2-medium:replicate": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "bytedance/seedream-5.0-lite": {
        "bytedance/seedream-5.0-lite:fal": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
            maxReferenceImages: 10,
        },
    },
    "x-ai/grok-imagine-video": {
        "x-ai/grok-imagine-video:fal": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "x-ai/grok-imagine-video-1.5": {
        "x-ai/grok-imagine-video-1.5:fal": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "alibaba/wan-2.6": {
        "alibaba/wan-2.6:fal": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "alibaba/wan-2.2-fast": {
        "alibaba/wan-2.2-fast:fal": {
            provider: "fal",
            addedDate: new Date("2026-09-02").getTime(),
            // Fal charges $0.05 per fixed 5-second 480p generation. The
            // inherited $0.01/second sheet bills the caller the same $0.05, so
            // this fallback has no loss for either text-to-video or image-to-video.
        },
    },
    "bytedance/seedance-1-pro-fast": {
        "bytedance/seedance-1-pro-fast:fal": {
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
        "tongyi-mai/z-image-turbo:fal": {
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
