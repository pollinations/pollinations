import { defineCostVariants, matchResolution } from "./cost-variants";
import type { FallbackMap } from "./merge-fallbacks";
import { perMillion } from "./price-helpers";

/**
 * Fallback routes for the image catalog, keyed by the model they serve and
 * then by the id each route is registered under. A route states only what
 * differs from that model; mergeFallbacks fills in the rest. See
 * `FallbackDefinition`.
 */
export const IMAGE_FALLBACKS = {
    "bytedance/seedream-5.0-pro": {
        "bytedance/seedream-5.0-pro:replicate": {
            provider: "replicate",
            cost: { completionImageTokens: 0.09 },
        },
    },
    "google/gemini-nano-banana-2.1": {
        "google/gemini-nano-banana-2.1:vercel": {
            provider: "vercel",
            // Pinned to Google. Record the gateway's reported charge; its
            // cached input is billed at full rate. Keep the caller's Vertex
            // price, including the cache discount, on this fallback.
            cost: {
                promptTextTokens: perMillion(1.5),
                promptImageTokens: perMillion(1.5),
                promptCachedTokens: perMillion(1.5),
                completionTextTokens: perMillion(7.5),
                completionImageTokens: perMillion(30),
            },
        },
    },
    "alibaba/wan-2.7-image": {
        "alibaba/wan-2.7-image:replicate": { provider: "replicate" },
    },
    "alibaba/wan-3.0": {
        "alibaba/wan-3.0:fal": {
            provider: "fal",
            // Fal Prime bills output only; retain the Alibaba quote.
            cost: { promptVideoSeconds: 0, completionVideoSeconds: 0.068 },
            costVariants: {
                "720p": { promptVideoSeconds: 0, completionVideoSeconds: 0.14 },
                "1080p": {
                    promptVideoSeconds: 0,
                    completionVideoSeconds: 0.28,
                },
            },
        },
    },
    "google/veo-3.1-fast": {
        "google/veo-3.1-fast:replicate": {
            provider: "replicate",
            // https://replicate.com/google/veo-3.1-fast: $0.10/s silent,
            // $0.15/s with audio at either resolution. Keep the caller's
            // Google quote; absorb the approved $0–$0.05/s fallback difference.
            cost: {
                completionVideoSeconds: 0.1,
                completionAudioSeconds: 0.05,
            },
        },
    },
    "openai/gpt-image-1-mini": {
        "openai/gpt-image-1-mini:openai": {
            provider: "openai",
            addedDate: new Date("2026-09-03").getTime(),
            // OpenAI shutdown_date.
            // Provider retires this route on 2026-12-01.
        },
    },
    "openai/gpt-image-1.5": {
        "openai/gpt-image-1.5:openai": {
            provider: "openai",
            addedDate: new Date("2026-09-03").getTime(),
            // OpenAI shutdown_date.
            // Provider retires this route on 2026-12-01.
        },
    },
    "openai/gpt-image-2": {
        "openai/gpt-image-2:openai": {
            provider: "openai",
            addedDate: new Date("2026-09-03").getTime(),
        },
    },
    "openai/gpt-image-2.5-flare": {
        "openai/gpt-image-2.5-flare:openai": {
            provider: "openai",
            addedDate: new Date("2026-09-14").getTime(),
        },
    },
    "openai/gpt-image-2.5-sunburst": {
        "openai/gpt-image-2.5-sunburst:openai": {
            provider: "openai",
            addedDate: new Date("2026-09-14").getTime(),
        },
    },
    "black-forest-labs/flux.1-kontext-pro": {
        "black-forest-labs/flux.1-kontext-pro:replicate": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "black-forest-labs/flux.1.1-pro": {
        "black-forest-labs/flux.1.1-pro:azure:sweden": {
            provider: "azure",
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
    "black-forest-labs/flux.2-max": {
        "black-forest-labs/flux.2-max:openrouter": {
            provider: "openrouter",
            addedDate: new Date("2026-09-13").getTime(),
            // OpenRouter (BFL's own "black-forest-labs/us-3" deployment). The
            // handler records OpenRouter's reported usage.cost (plus the
            // 5.5% credit fee, #14895) as this route's cost, since BFL bills
            // tiered megapixels of the size it picks. These rates only
            // describe the route: $0.07 per output megapixel with the fee,
            // no input charge, no execution fee.
            cost: {
                promptImageTokens: 0,
                completionImageTokens: 0.07 * 1.055,
            },
            billing: {
                adjustments: [],
            },
        },
    },
    "qwen/qwen-image-3": {
        "qwen/qwen-image-3:openrouter": {
            provider: "openrouter",
            addedDate: new Date("2026-10-14").getTime(),
            // OpenRouter's qwen/qwen-image-3-pro on Alibaba: the primary's
            // exact checkpoint. The handler records OpenRouter's reported
            // usage.cost plus the 5.5% credit fee; these rates describe the
            // route at 1K.
            cost: {
                promptImageTokens: 0.003 * 1.055,
                completionImageTokens: 0.04 * 1.055,
            },
        },
    },
    "qwen/qwen-image-2.1-pro": {
        "qwen/qwen-image-2.1-pro:openrouter": {
            provider: "openrouter",
            addedDate: new Date("2026-10-18").getTime(),
            // OpenRouter's Alibaba endpoint. Maintainer probe (2026-10-18):
            // usage.cost is $0.046 per image before the 5.5% credit fee, so this
            // route is above the $0.04 primary price. Up to 4 references.
            cost: {
                completionImageTokens: 0.046 * 1.055,
            },
        },
    },
    "prunaai/p-image-edit": {
        "prunaai/p-image-edit:replicate": {
            provider: "replicate",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "google/gemini-2.5-flash-image": {
        "google/gemini-2.5-flash-image:openrouter:vertex-global": {
            provider: "openrouter",
            priceMultiplier: 1,
            addedDate: new Date("2026-09-21").getTime(),
            // OpenRouter expiration_date.
            // Provider retires this route on 2027-03-15.
            cost: {
                promptTextTokens: perMillion(0.3) * 1.055,
                promptImageTokens: perMillion(0.3) * 1.055,
                completionTextTokens: perMillion(2.5) * 1.055,
                completionImageTokens: perMillion(30) * 1.055,
            },
        },
    },
    "google/gemini-3.1-flash-image": {
        "google/gemini-3.1-flash-image:openrouter:vertex-global": {
            provider: "openrouter",
            priceMultiplier: 1,
            addedDate: new Date("2026-09-21").getTime(),
            cost: {
                promptTextTokens: perMillion(0.5) * 1.055,
                promptImageTokens: perMillion(0.5) * 1.055,
                completionTextTokens: perMillion(3) * 1.055,
                completionImageTokens: perMillion(60) * 1.055,
            },
        },
    },
    "google/gemini-3.1-flash-lite-image": {
        "google/gemini-3.1-flash-lite-image:openrouter:vertex-global": {
            provider: "openrouter",
            priceMultiplier: 1,
            addedDate: new Date("2026-09-21").getTime(),
            cost: {
                promptTextTokens: perMillion(0.25) * 1.055,
                promptImageTokens: perMillion(0.25) * 1.055,
                completionTextTokens: perMillion(1.5) * 1.055,
                completionImageTokens: perMillion(30) * 1.055,
            },
        },
    },
    "google/gemini-3-pro-image": {
        "google/gemini-3-pro-image:openrouter:ai-studio-global": {
            provider: "openrouter",
            priceMultiplier: 1,
            addedDate: new Date("2026-09-21").getTime(),
            cost: {
                promptTextTokens: perMillion(2) * 1.055,
                promptImageTokens: perMillion(2) * 1.055,
                completionTextTokens: perMillion(12) * 1.055,
                completionImageTokens: perMillion(120) * 1.055,
            },
        },
    },
    "black-forest-labs/flux.1-schnell": {
        "black-forest-labs/flux.1-schnell:deepinfra": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            // Per 1024² image; the handler records DeepInfra's reported
            // charge, which scales with image area.
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
    "heygen/heygen-video-1": {
        "heygen/heygen-video-1:openrouter": {
            provider: "openrouter",
            addedDate: new Date("2026-10-24").getTime(),
            // OpenRouter HeyGen rates with its 50% launch discount (list
            // $0.02/s at 480p, $0.036/s at 768p), plus the 5.5% credit fee.
            // The handler bills OpenRouter's reported cost.
            cost: { completionVideoSeconds: 0.01 * 1.055 },
            ...defineCostVariants(
                { "768p": { completionVideoSeconds: 0.018 * 1.055 } },
                matchResolution("768p"),
                {
                    "768p": {
                        label: "768p",
                        description:
                            "Applies when the requested video resolution is 768p.",
                    },
                },
                "480p",
            ),
        },
    },
    "x-ai/grok-imagine-video": {
        "x-ai/grok-imagine-video:fal": {
            provider: "fal",
            cost: {
                promptImageTokens: 0.002,
                completionVideoSeconds: 0.07,
            },
        },
    },
    "x-ai/grok-imagine-video-1.5": {
        "x-ai/grok-imagine-video-1.5:fal": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptImageTokens: 0.01, // per start-frame image
                completionVideoSeconds: 0.14, // per sec at 720p
            },
            costVariants: {
                "480p": {
                    completionVideoSeconds: 0.08,
                },
                "1080p": {
                    completionVideoSeconds: 0.25,
                },
            },
        },
    },
    "x-ai/grok-imagine-image-2.0": {
        "x-ai/grok-imagine-image-2.0:openrouter": {
            provider: "openrouter",
            addedDate: new Date("2026-10-24").getTime(),
            cost: {
                promptImageTokens: 0.01 * 1.055,
                completionImageTokens: 0.06 * 1.055, // medium, 1K
            },
            costVariants: {
                low_1k: {
                    promptImageTokens: 0.01 * 1.055,
                    completionImageTokens: 0.04 * 1.055,
                },
                low_2k: {
                    promptImageTokens: 0.01 * 1.055,
                    completionImageTokens: 0.06 * 1.055,
                },
                medium_2k: {
                    promptImageTokens: 0.01 * 1.055,
                    completionImageTokens: 0.08 * 1.055,
                },
            },
        },
    },
    "x-ai/grok-imagine-video-1.5-lite": {
        "x-ai/grok-imagine-video-1.5-lite:openrouter": {
            provider: "openrouter",
            addedDate: new Date("2026-10-06").getTime(),
            cost: {
                promptImageTokens: 0.01 * 1.055, // per start-frame image
                completionVideoSeconds: 0.03 * 1.055, // per sec at 720p
            },
            costVariants: {
                "480p": {
                    completionVideoSeconds: 0.02 * 1.055,
                },
                "1080p": {
                    completionVideoSeconds: 0.14 * 1.055,
                },
            },
        },
    },
    "alibaba/wan-2.6": {
        "alibaba/wan-2.6:replicate": { provider: "replicate" },
        "alibaba/wan-2.6:fal": {
            provider: "fal",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "alibaba/wan-2.2-fast": {
        // Replicate is fallback-only: its 4xx rate (~48%, 2026-10-21
        // /models/status) is terminal (400/422 don't retry), so it must not
        // be tried first. No :fal route: primary is already Fal, and a
        // same-endpoint auto-retry would only regenerate on shared Fal faults.
        "alibaba/wan-2.2-fast:replicate": { provider: "replicate" },
    },
    "bytedance/seedance-1-pro-fast": {
        "bytedance/seedance-1-pro-fast:replicate": {
            provider: "replicate",
            addedDate: new Date("2026-10-24").getTime(),
            // Replicate per-second rates by resolution (2026-10-24).
            cost: { completionVideoSeconds: 0.025 },
            ...defineCostVariants(
                {
                    "480p": { completionVideoSeconds: 0.015 },
                    "1080p": { completionVideoSeconds: 0.06 },
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
    "recraft/recraft-v4.1-flash": {
        "recraft/recraft-v4.1-flash:openrouter": {
            provider: "openrouter",
            addedDate: new Date("2026-10-24").getTime(),
            // $0.007 per image plus the 5.5% OpenRouter credit fee.
            cost: { completionImageTokens: 0.007 * 1.055 },
        },
    },
    "tongyi-mai/z-image-turbo": {
        "tongyi-mai/z-image-turbo:fal": {
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
        },
    },
} as const satisfies FallbackMap;
