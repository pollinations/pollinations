import { defineCostVariants, matchResolution } from "./cost-variants";
import { perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

export const DEFAULT_IMAGE_MODEL = "zimage" as const;

export type ImageModelName = keyof typeof IMAGE_SERVICES;

export const IMAGE_SERVICES = {
    "krea": {
        aliases: ["krea-2"],
        provider: "fal",
        brand: "Krea",
        category: "image",
        addedDate: new Date("2026-08-01").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.03, // flat per text-to-image output
        },
        title: "Krea 2 Medium",
        description:
            "Style-rich generation with strong prompt adherence and clean typography",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "dreamshaper": {
        // "sana" is kept as an alias so existing callers and the legacy image
        // proxy worker keep working unchanged.
        aliases: ["sana"],
        provider: "vast",
        brand: "Lykon",
        category: "image",
        addedDate: new Date("2026-07-30").getTime(),
        priceMultiplier: 1,
        cost: {
            completionImageTokens: 0.0001, // per image
        },
        title: "DreamShaper 8 LCM",
        description:
            "Near-instant images at rock-bottom cost; simpler detail than premium models",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "kontext": {
        aliases: [],
        provider: "azure",
        brand: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        priceMultiplier: 1,
        cost: {
            completionImageTokens: 0.04, // per image
        },
        title: "FLUX.1 Kontext Pro",
        description:
            "Edits an existing image from plain instructions — swap, restyle, refine",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1, // Azure FLUX.1 Kontext edit route forwards one input image.
    },
    "nanobanana": {
        aliases: [],
        provider: "openrouter",
        brand: "Google",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // Gemini 2.5 Flash Image via Vertex AI
            promptTextTokens: perMillion(0.3), // per 1M tokens
            promptImageTokens: perMillion(0.3), // per 1M tokens
            completionTextTokens: perMillion(2.5), // text output tokens
            completionImageTokens: perMillion(30), // per 1M tokens, 1290 tokens/image
        },
        title: "Nano Banana",
        description:
            "Quick image generation and editing that follows instructions well",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 3, // Pollinations cap for Gemini 2.5 Flash Image route.
    },
    "nanobanana-2": {
        aliases: ["nanobanana2"],
        provider: "openrouter",
        brand: "Google",
        category: "image",
        addedDate: new Date("2026-02-27").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // Gemini 3.1 Flash Image via Vertex AI
            promptTextTokens: perMillion(0.5), // per 1M tokens
            promptImageTokens: perMillion(0.5), // per 1M tokens
            completionTextTokens: perMillion(3), // text/reasoning output tokens
            completionImageTokens: perMillion(60), // per 1M tokens, 2520 tokens/image
        },
        title: "Nano Banana 2",
        description:
            "Sharper detail and better text rendering in generated and edited images",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Pollinations cap for Gemini 3.1 Flash Image route.
    },
    "nanobanana-2-lite": {
        aliases: ["nanobanana2lite", "nanobanana-lite"],
        provider: "openrouter",
        brand: "Google",
        category: "image",
        addedDate: new Date("2026-06-30").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // Gemini 3.1 Flash-Lite Image (GA) via Vertex AI — half of nanobanana-2
            promptTextTokens: perMillion(0.25), // per 1M tokens
            promptImageTokens: perMillion(0.25), // per 1M tokens
            completionTextTokens: perMillion(1.5), // text/reasoning output tokens
            completionImageTokens: perMillion(30), // per 1M tokens, 1120 tokens/1K image = $0.0336
        },
        title: "Nano Banana 2 Lite",
        description:
            "Speedy, affordable image generation and editing for everyday use",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Pollinations cap for Gemini 3.1 Flash-Lite Image route.
    },
    "nanobanana-pro": {
        aliases: [],
        provider: "openrouter",
        brand: "Google",
        category: "image",
        addedDate: new Date("2025-12-01").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // Gemini 3 Pro Image via Vertex AI
            // 1K/2K image: 1120 tokens = $0.134/image ($120/M tokens)
            // 4K image: 2000 tokens = $0.24/image
            promptTextTokens: perMillion(2), // per 1M tokens
            promptImageTokens: perMillion(2), // per 1M tokens
            completionTextTokens: perMillion(12), // text/reasoning output tokens
            completionImageTokens: perMillion(120), // per 1M tokens, 1120 tokens per 1K image
        },
        title: "Nano Banana Pro",
        description:
            "Studio-quality images up to 4K, with reasoning for tricky prompts",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Gemini 3 Pro Image provider limit.
    },
    "seedream5": {
        aliases: [],
        provider: "replicate",
        brand: "ByteDance",
        category: "image",
        addedDate: new Date("2026-02-27").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.035, // per image
        },
        title: "Seedream 5.0 Lite",
        description:
            "Image generation that can search the web and reason about your prompt",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Pollinations route cap from Replicate schema.
    },
    "seedream5-pro": {
        aliases: ["seedream-5-pro", "seedream-pro-5"],
        provider: "replicate",
        brand: "ByteDance",
        category: "image",
        addedDate: new Date("2026-07-10").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.09, // per 2K image
        },
        title: "Seedream 5.0 Pro",
        description: "Premium multimodal image generation and editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10,
    },
    "seedream": {
        aliases: [],
        provider: "replicate",
        brand: "ByteDance",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.03, // per image
        },
        title: "Seedream 4.0",
        description: "Photorealistic images with strong prompt adherence",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10, // Pollinations route cap from Replicate schema.
    },
    "seedream-pro": {
        aliases: [],
        provider: "openrouter",
        brand: "ByteDance",
        category: "image",
        addedDate: new Date("2025-12-04").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.04, // per image
        },
        title: "Seedream 4.5",
        description: "Premium photorealism for lifelike scenes and portraits",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Pollinations route cap from OpenRouter schema.
    },
    // Ideogram 4.0 (turbo/balanced/quality) via Replicate. These are official
    // Replicate models (is_official=true) → billed a FLAT price per output
    // image set by the publisher, NOT per-second of GPU time. The price is
    // therefore independent of the resolution preset the handler picks, and all
    // v4 presets sit in a single 3.4–4.2 MP band (no 1K/2K/4K tier split). So a
    // flat per-image cost is correct regardless of aspect ratio / resolution.
    "ideogram-v4-turbo": {
        aliases: [],
        provider: "replicate",
        brand: "Ideogram",
        category: "image",
        addedDate: new Date("2026-06-15").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.03, // flat per image — ideogram-ai/ideogram-v4-turbo
        },
        title: "Ideogram 4.0 Turbo",
        description: "Fast images with crisp, accurate text and typography",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "ideogram-v4-balanced": {
        aliases: [],
        provider: "replicate",
        brand: "Ideogram",
        category: "image",
        addedDate: new Date("2026-06-15").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.06, // flat per image — ideogram-ai/ideogram-v4-balanced
        },
        title: "Ideogram 4.0 Balanced",
        description: "Balanced speed and quality with accurate text rendering",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "ideogram-v4-quality": {
        aliases: [],
        provider: "replicate",
        brand: "Ideogram",
        category: "image",
        addedDate: new Date("2026-06-15").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.1, // flat per image — ideogram-ai/ideogram-v4-quality
        },
        title: "Ideogram 4.0 Quality",
        description:
            "Highest-fidelity images with spot-on typography; slower to generate",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        provider: "azure",
        brand: "OpenAI",
        category: "image",
        addedDate: new Date("2025-10-10").getTime(),
        priceMultiplier: 0.75,
        cost: {
            promptTextTokens: perMillion(2.0), // per 1M tokens
            promptCachedTokens: perMillion(0.2), // per 1M tokens
            promptImageTokens: perMillion(2.5), // per 1M tokens
            completionImageTokens: perMillion(8), // per 1M tokens
        },
        title: "GPT Image 1 Mini",
        description: "Affordable image creation and editing for everyday use",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16, // GPT Image edit endpoint accepts up to 16 input images.
    },
    "gptimage-large": {
        aliases: ["gpt-image-1.5", "gpt-image-large"],
        provider: "azure",
        brand: "OpenAI",
        category: "image",
        addedDate: new Date("2025-12-23").getTime(),
        priceMultiplier: 1,
        cost: {
            // Official pricing: https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-openai%E2%80%99s-gpt-image-1-5-in-microsoft-foundry/4478139
            promptTextTokens: perMillion(5), // per 1M tokens
            promptCachedTokens: perMillion(1.25), // per 1M tokens
            promptImageTokens: perMillion(8), // per 1M tokens
            completionTextTokens: perMillion(10), // per 1M tokens
            completionImageTokens: perMillion(32), // per 1M tokens
        },
        title: "GPT Image 1.5",
        description:
            "High-fidelity image generation and editing with fine detail",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16, // GPT Image edit endpoint accepts up to 16 input images.
    },
    "gpt-image-2": {
        aliases: [],
        provider: "azure",
        brand: "OpenAI",
        category: "image",
        addedDate: new Date("2026-04-22").getTime(),
        paidOnly: false,
        priceMultiplier: 0.75,
        cost: {
            promptTextTokens: perMillion(5), // per 1M tokens
            promptCachedTokens: perMillion(1.25), // per 1M tokens
            promptImageTokens: perMillion(8), // per 1M tokens
            completionImageTokens: perMillion(30), // per 1M tokens
        },
        title: "GPT Image 2",
        description:
            "Premium high-resolution images with excellent prompt following",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16, // GPT Image edit endpoint accepts up to 16 input images.
    },
    "flux": {
        aliases: [],
        provider: "vast",
        brand: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        priceMultiplier: 1,
        cost: {
            completionImageTokens: 0.002, // per image
        },
        title: "FLUX.1 Schnell",
        description: "Fast, high-quality images at a tiny cost",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "zimage": {
        aliases: ["z-image", "z-image-turbo"],
        provider: "vast",
        fallbacks: ["zimage-fal"],
        // Fal is capacity insurance only: do not move provider errors or bad
        // requests away from the Pollinations-operated Vast pool.
        fallbackOnStatusCodes: [503],
        brand: "Alibaba",
        category: "image",
        addedDate: new Date("2025-12-08").getTime(),
        priceMultiplier: 1,
        cost: {
            completionImageTokens: 0.004, // per image
        },
        title: "Z-Image Turbo",
        description:
            "Instant, budget-friendly images with crisp upscaled output",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
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
    "veo": {
        aliases: [
            "veo-3.1-fast",
            "veo-720p",
            "video",
            "veo-1080p",
            "veo-3.1-fast-1080p",
            "veo-1080",
        ],
        provider: "google",
        brand: "Google",
        category: "video",
        addedDate: new Date("2025-11-27").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            completionVideoSeconds: 0.08, // per sec (720p video)
            completionAudioSeconds: 0.02, // per sec when audio is enabled
        },
        ...defineCostVariants(
            {
                "1080p": {
                    completionVideoSeconds: 0.1, // per sec (1080p video)
                },
            },
            matchResolution("1080p"),
            {
                "1080p": {
                    label: "1080p",
                    description:
                        "Applies when the requested video resolution is 1080p.",
                },
            },
            "720p",
        ),
        resolutions: ["720p", "1080p"],
        title: "Veo 3.1 Fast",
        description: "Fast video with optional audio at 720p or 1080p",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
    },
    "seedance-pro": {
        aliases: [],
        provider: "replicate",
        brand: "ByteDance",
        category: "video",
        addedDate: new Date("2025-12-04").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Replicate bytedance/seedance-1-pro-fast is per-second tiered by
        // resolution (480p $0.015, 720p $0.025, 1080p $0.06).
        cost: {
            completionVideoSeconds: 0.025, // per sec at 720p
        },
        ...defineCostVariants(
            {
                "480p": {
                    completionVideoSeconds: 0.015,
                },
                "1080p": {
                    completionVideoSeconds: 0.06,
                },
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
        resolutions: ["720p", "480p", "1080p"],
        title: "Seedance 1.0 Pro Fast",
        description: "Video from text or a start image at 480p, 720p, or 1080p",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "seedance-2.0": {
        aliases: ["seedance-2"],
        provider: "replicate",
        brand: "ByteDance",
        category: "video",
        addedDate: new Date("2026-05-07").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // non_video_in tier @ 720p; see Economics' replicate connector guide
        cost: {
            completionVideoSeconds: 0.18,
        },
        title: "Seedance 2.0",
        description:
            "720p video with natively synced sound, from text or images",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
    },
    "wan": {
        aliases: ["wan2.6", "wan-i2v"],
        provider: "replicate",
        brand: "Alibaba",
        category: "video",
        addedDate: new Date("2026-01-21").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Replicate wan-2.6, locked to 720p ($0.10/s). Native audio is bundled
        // into the per-second rate, so there is no separate audio line.
        cost: {
            completionVideoSeconds: 0.1, // per sec (720p, includes audio)
        },
        title: "Wan 2.6",
        description:
            "Video with sound from text or an image (720p, 5/10/15s clips)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "audio_output"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "wan-fast": {
        aliases: ["wan2.2", "wan-2.2"],
        provider: "replicate",
        brand: "Alibaba",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Replicate wan-2.2-fast, locked to 480p. Silent, fixed ~5s clip billed
        // flat ($0.01/s x 5s = $0.05).
        cost: {
            completionVideoSeconds: 0.01, // per sec (480p, silent)
        },
        title: "Wan 2.2",
        description:
            "Cheap 5-second silent clips at 480p — great for quick drafts",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
    },
    "wan-pro": {
        aliases: [
            "wan2.7",
            "wan-2.7",
            "wan-pro-1080p",
            "wan2.7-1080p",
            "wan-pro-1080",
        ],
        provider: "replicate",
        brand: "Alibaba",
        category: "video",
        addedDate: new Date("2026-05-26").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Replicate wan-2.7. Audio is bundled into the per-second rate. T2V is
        // $0.10/s at both resolutions; I2V is $0.10/s at 720p and $0.15/s at
        // 1080p.
        cost: {
            completionVideoSeconds: 0.1, // per sec (720p, includes audio)
        },
        ...defineCostVariants(
            {
                "1080p": {
                    completionVideoSeconds: 0.1,
                },
                "1080p_image": {
                    completionVideoSeconds: 0.15,
                },
            },
            ({ input }) => {
                if (input?.resolution !== "1080p") return undefined;
                return input.hasImage ? "1080p_image" : "1080p";
            },
            {
                "1080p": {
                    label: "1080p text-to-video",
                    description:
                        "Applies to 1080p requests without an input image.",
                },
                "1080p_image": {
                    label: "1080p image-to-video",
                    description:
                        "Applies to 1080p requests with an input image.",
                },
            },
            "720p",
        ),
        resolutions: ["720p", "1080p"],
        title: "Wan 2.7",
        description: "Keyframe-controlled video with sound at 720p or 1080p",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
    },
    "wan-image": {
        aliases: ["wan2.7-image", "wan-img"],
        provider: "replicate",
        brand: "Alibaba",
        category: "image",
        addedDate: new Date("2026-04-02").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // Moved off Alibaba DashScope ($0.035) to Replicate wan-2.7-image.
        cost: {
            completionImageTokens: 0.03, // per image
        },
        title: "Wan 2.7 Image",
        description:
            "Text-to-image and instruction-based editing up to 2K resolution",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 9, // Pollinations route cap.
    },
    "wan-image-pro": {
        aliases: ["wan2.7-image-pro", "wan-img-pro"],
        provider: "replicate",
        brand: "Alibaba",
        category: "image",
        addedDate: new Date("2026-04-02").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Moved off Alibaba DashScope ($0.075) to Replicate wan-2.7-image-pro,
        // which prices Pro identically to standard ($0.03/img).
        cost: {
            completionImageTokens: 0.03, // per image
        },
        title: "Wan 2.7 Image Pro",
        description:
            "Detailed 4K image generation and editing with a thinking mode",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 9, // Pollinations route cap.
    },
    "qwen-image": {
        aliases: [
            "qwen-image-plus",
            "qwen-image-2512",
            "qwen-image-edit",
            "qwen-image-edit-plus",
        ],
        provider: "replicate",
        brand: "Qwen",
        category: "image",
        addedDate: new Date("2026-03-23").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // Moved off Alibaba DashScope to Replicate: qwen/qwen-image (t2i,
        // $0.025) + qwen/qwen-image-edit-plus (edit, $0.03).
        cost: {
            completionImageTokens: 0.025, // per t2i image
        },
        ...defineCostVariants(
            {
                edit: {
                    completionImageTokens: 0.03, // per edited image
                },
            },
            ({ input }) => (input?.hasImage ? "edit" : undefined),
            {
                edit: {
                    label: "Image editing",
                    description:
                        "Applies when the request includes one or more input images.",
                },
            },
            "Image generation",
        ),
        title: "Qwen Image",
        description:
            "Versatile image creation and editing, strong at text inside images",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 3, // DashScope Qwen Image Edit route cap.
    },
    "qwen-image-3": {
        aliases: ["qwen-image-3.0"],
        provider: "fal",
        brand: "Qwen",
        category: "image",
        addedDate: new Date("2026-07-23").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            completionImageTokens: 0.075, // per image
        },
        title: "Qwen Image 3.0",
        description:
            "Generates detailed images with crisp multilingual text and complex layouts",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "grok-imagine": {
        aliases: ["grok-imagine-image"],
        provider: "xai",
        brand: "xAI",
        category: "image",
        addedDate: new Date("2026-02-25").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            promptImageTokens: 0.002, // per input image on edits
            completionImageTokens: 0.02, // per image
        },
        title: "Grok Imagine",
        description: "Photorealistic image generation and quick edits",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1, // xAI image edit route forwards one input image.
    },
    "grok-imagine-pro": {
        aliases: [
            "grok-aurora",
            "aurora",
            "grok-imagine-image-quality",
            "grok-imagine-image-pro",
        ],
        provider: "openrouter",
        brand: "xAI",
        category: "image",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            promptImageTokens: 0.01, // per input image on edits
            completionImageTokens: 0.05, // per 1K image
        },
        title: "Grok Imagine Pro",
        description:
            "Higher-fidelity photorealistic images for polished results",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1, // OpenRouter image edit route forwards one input image.
    },
    "recraft-v4.1-vector": {
        aliases: ["recraft-vector", "recraft-svg", "recraft-v4.1-svg"],
        provider: "openrouter",
        brand: "Recraft",
        category: "image",
        addedDate: new Date("2026-07-24").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.08, // fixed per output SVG
        },
        title: "Recraft V4.1 Vector",
        description:
            "Editable SVG generation and reference-guided vector design",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1,
    },
    "grok-video-pro": {
        aliases: ["grok-imagine-video"],
        provider: "openrouter",
        brand: "xAI",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            promptImageTokens: 0.002, // per start-frame image
            completionVideoSeconds: 0.07, // per sec at 720p
        },
        title: "Grok Video Pro",
        description: "Short videos from text or an image (720p, 1-15s)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "grok-imagine-video-1.5": {
        aliases: [],
        provider: "openrouter",
        brand: "xAI",
        category: "video",
        addedDate: new Date("2026-08-03").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            promptImageTokens: 0.01, // per start-frame image
            completionVideoSeconds: 0.14, // per sec at 720p
        },
        ...defineCostVariants(
            {
                "480p": {
                    completionVideoSeconds: 0.08,
                },
                "1080p": {
                    completionVideoSeconds: 0.25,
                },
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
        resolutions: ["720p", "480p", "1080p"],
        title: "Grok Imagine Video 1.5",
        description:
            "Video from text or a start image with synchronized audio at 480p, 720p, or 1080p",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "audio_output"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "seedance-2.5": {
        aliases: [],
        provider: "replicate",
        brand: "ByteDance",
        category: "video",
        addedDate: new Date("2026-08-09").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.1028, // per sec at 480p
        },
        ...defineCostVariants(
            {
                "720p": {
                    completionVideoSeconds: 0.2312,
                },
            },
            matchResolution("720p"),
            {
                "720p": {
                    label: "720p",
                    description:
                        "Applies when the requested video resolution is 720p.",
                },
            },
            "480p",
        ),
        resolutions: ["480p", "720p"],
        title: "Seedance 2.5",
        description:
            "Four-second video with synchronized audio and first/last-frame control at 480p or 720p",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
    },
    "happyhorse-1.1": {
        aliases: ["happyhorse", "happy-horse-1.1"],
        provider: "openrouter",
        brand: "Alibaba",
        category: "video",
        addedDate: new Date("2026-07-18").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.0988, // per sec at 720p
        },
        title: "HappyHorse 1.1",
        description: "Text and first-frame video generation at 720p",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1,
    },
    "klein": {
        aliases: ["flux-klein"],
        provider: "vast",
        brand: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2026-01-17").getTime(),
        priceMultiplier: 1,
        cost: {
            completionImageTokens: 0.005,
        },
        title: "FLUX.2 Klein 4B",
        description: "Fast image generation and editing up to 2.4 megapixels",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10, // Pollinations self-hosted route cap.
    },
    "p-image": {
        aliases: ["pruna-image", "pruna"],
        provider: "deepinfra",
        brand: "Pruna",
        category: "image",
        addedDate: new Date("2026-03-14").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.005, // per image
        },
        title: "Pruna p-image",
        description: "Cheap, speedy text-to-image for rapid iteration",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "p-image-edit": {
        aliases: ["pruna-edit", "pruna-image-edit"],
        provider: "deepinfra",
        brand: "Pruna",
        category: "image",
        addedDate: new Date("2026-03-14").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.01, // per image
        },
        title: "Pruna p-image-edit",
        description: "Fast instruction-based photo editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 5, // Pollinations route cap.
    },
    // Pruna p-video is one Replicate model priced per second by resolution:
    // 720p $0.02/s and 1080p $0.04/s in standard mode.
    "p-video": {
        aliases: [
            "pruna-video",
            "p-video-720p",
            "p-video-1080p",
            "pruna-video-1080p",
        ],
        provider: "replicate",
        brand: "Pruna",
        category: "video",
        addedDate: new Date("2026-03-14").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.02, // Replicate 720p per sec
        },
        ...defineCostVariants(
            {
                "1080p": {
                    completionVideoSeconds: 0.04,
                },
            },
            matchResolution("1080p"),
            {
                "1080p": {
                    label: "1080p",
                    description:
                        "Applies when the requested video resolution is 1080p.",
                },
            },
            "720p",
        ),
        resolutions: ["720p", "1080p"],
        title: "Pruna p-video",
        description: "Affordable video from text or an image at 720p or 1080p",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "nova-canvas": {
        aliases: ["amazon-nova-canvas"],
        provider: "bedrock",
        brand: "Amazon",
        category: "image",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        cost: {
            completionImageTokens: 0.04, // per image
        },
        title: "Nova Canvas",
        description: "Image generation with editing and inpainting tools",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1, // Nova Canvas route forwards one input image.
    },
    "nova-reel": {
        aliases: ["amazon-nova-reel"],
        provider: "bedrock",
        brand: "Amazon",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        cost: {
            completionVideoSeconds: 0.08, // per sec
        },
        title: "Nova Reel",
        description:
            "Long-form video — clips from 6 seconds up to 2 minutes at 720p",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
} as const satisfies Record<string, ModelDefinition>;

const isVideoService = (svc: {
    outputModalities?: readonly string[];
}): boolean => svc.outputModalities?.includes("video") ?? false;

export const getVideoModelIds = (): string[] =>
    Object.keys(IMAGE_SERVICES).filter((id) =>
        isVideoService(IMAGE_SERVICES[id as ImageModelName]),
    );

export const getImageModelIds = (): string[] =>
    Object.keys(IMAGE_SERVICES).filter(
        (id) => !isVideoService(IMAGE_SERVICES[id as ImageModelName]),
    );
