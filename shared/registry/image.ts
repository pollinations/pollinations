import { defineCostVariants, matchResolution } from "./cost-variants";
import { IMAGE_FALLBACKS } from "./image-fallbacks";
import { mergeFallbacks } from "./merge-fallbacks";
import { perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

export const DEFAULT_IMAGE_MODEL = "tongyi-mai/z-image-turbo" as const;

export type ImageModelName = keyof typeof IMAGE_SERVICES;

const IMAGE_BASE_SERVICES = {
    "sony/mmaudio-v2": {
        aliases: [],
        provider: "replicate",
        publisher: "Sony AI",
        category: "video",
        title: "MMAudio V2",
        description:
            "Adds synchronized sound effects and ambience to an existing video",
        addedDate: new Date("2026-09-26").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        inputModalities: ["text", "video"],
        outputModalities: ["video"],
        supportedEndpoints: ["/video/audio"],
        videoCapabilities: ["audio_output"],
        // Replicate sets no upper bound; fal documents 1-30s for this model.
        minDuration: 1,
        maxDuration: 30,
        defaultDuration: 8,
        // Billed from Replicate's reported GPU time on L40S:
        // https://replicate.com/pricing (verified 2026-09-26).
        cost: { completionVideoSeconds: 0 },
        billing: {
            adjustments: [
                {
                    id: "replicate.mmaudio.compute.v1",
                    description: "Replicate L40S execution time",
                    kind: "compute",
                    unit: "second",
                    unitCost: 0.000975,
                    publicPricing: {
                        label: "GPU execution",
                        quantity: 1,
                        unit: "second",
                    },
                    countUnits: (_output, input) => input?.computeSeconds ?? 0,
                },
            ],
        },
    },
    "krea/krea-2-medium": {
        aliases: ["krea-2", "krea"],
        provider: "fal",
        publisher: "Krea",
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
    "lykon/dreamshaper-8-lcm": {
        // "sana" is kept as an alias so existing callers and the legacy image
        // proxy worker keep working unchanged.
        aliases: ["sana", "dreamshaper"],
        provider: "vast",
        publisher: "Lykon",
        category: "image",
        addedDate: new Date("2026-07-30").getTime(),
        priceMultiplier: 1,
        perUserRpm: 300,
        cost: {
            completionImageTokens: 0.0001, // per image
        },
        title: "DreamShaper 8 LCM",
        description:
            "Near-instant images at rock-bottom cost; simpler detail than premium models",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "black-forest-labs/flux.1-kontext-pro": {
        aliases: ["kontext"],
        provider: "azure",
        publisher: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        priceMultiplier: 0.75,
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
    "black-forest-labs/flux.1.1-pro": {
        aliases: [],
        provider: "azure",
        publisher: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2026-09-23").getTime(),
        priceMultiplier: 0.75,
        paidOnly: false,
        cost: {
            completionImageTokens: 0.04, // Azure Global Standard, $40/1K images in East US and Sweden Central.
        },
        title: "FLUX 1.1 Pro",
        description:
            "Fast text-to-image generation with precise dimensions and reproducible seeds",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "black-forest-labs/flux.2-pro": {
        aliases: ["flux-2-pro"],
        provider: "azure",
        publisher: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2026-08-31").getTime(),
        priceMultiplier: 0.75,
        paidOnly: true,
        // Azure Global Standard pricing, verified 2026-08-31. Azure rounds
        // input and output megapixels up to whole billable units.
        cost: {
            promptImageTokens: 0.015,
            completionImageTokens: 0.015,
        },
        billing: {
            adjustments: [
                {
                    id: "azure.flux_2_pro.initial_output_megapixel.v1",
                    description: "FLUX.2 Pro initial output megapixel premium",
                    kind: "image",
                    unit: "generation",
                    unitCost: 0.015,
                    publicPricing: {
                        label: "Initial output megapixel premium",
                        quantity: 1,
                        unit: "generation",
                    },
                    countUnits: () => 1,
                },
            ],
        },
        title: "FLUX.2 Pro",
        description:
            "High-fidelity generation and multi-reference editing with strong prompt adherence",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 8, // Azure FLUX.2 Pro route limit.
    },
    "black-forest-labs/flux.2-flex": {
        aliases: ["flux-2-flex"],
        provider: "azure",
        publisher: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2026-08-31").getTime(),
        priceMultiplier: 0.75,
        paidOnly: true,
        // Azure Global Standard pricing, verified 2026-08-31. Azure rounds
        // input and output megapixels up to whole billable units.
        cost: {
            promptImageTokens: 0.05,
            completionImageTokens: 0.05,
        },
        title: "FLUX.2 Flex",
        description:
            "Typography-focused generation and multi-reference editing with adjustable prompt guidance",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10,
    },
    "black-forest-labs/flux.2-max": {
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
    },
    "microsoft/mai-image-2.5-flash": {
        aliases: [],
        provider: "azure",
        publisher: "Microsoft",
        category: "image",
        addedDate: new Date("2026-09-05").getTime(),
        // Azure retirement schedule; the model catalog says 2026-11-15.
        retirementDate: new Date("2026-10-01").getTime(),
        paidOnly: false,
        priceMultiplier: 0.75,
        perUserRpm: 12, // Whole Azure East US deployment quota; low concurrency expected.
        // Azure Global Standard meters and invoiced usage, verified 2026-09-05.
        // Output tokens = pixels / 1024, so a 1024x1024 image is 1,024 tokens.
        cost: {
            promptTextTokens: perMillion(1.75),
            promptImageTokens: perMillion(1.75),
            completionImageTokens: perMillion(19.5),
        },
        title: "MAI Image 2.5 Flash",
        description:
            "Quick photorealistic generation and single-reference editing with accurate text rendering",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1, // Azure MAI edit route takes one input image.
    },
    "microsoft/mai-image-2.6-flash": {
        aliases: [],
        provider: "azure",
        publisher: "Microsoft",
        category: "image",
        addedDate: new Date("2026-09-22").getTime(),
        retirementDate: new Date("2027-01-09").getTime(),
        paidOnly: false,
        priceMultiplier: 0.75,
        perUserRpm: 12,
        // Azure Global Standard meters, verified 2026-09-22 in both regions.
        cost: {
            promptTextTokens: perMillion(1.75),
            promptImageTokens: perMillion(2.5),
            completionImageTokens: perMillion(19),
        },
        title: "MAI Image 2.6 Flash",
        description:
            "Photorealistic generation and single-reference editing with accurate text rendering",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1,
    },
    "microsoft/mai-image-2.6": {
        aliases: [],
        provider: "azure",
        publisher: "Microsoft",
        category: "image",
        addedDate: new Date("2026-09-23").getTime(),
        retirementDate: new Date("2027-01-09").getTime(),
        paidOnly: false,
        priceMultiplier: 0.75,
        perUserRpm: 12,
        // Azure Global Standard meters, verified 2026-09-23.
        cost: {
            promptTextTokens: perMillion(5),
            promptImageTokens: perMillion(8),
            completionImageTokens: perMillion(38),
        },
        title: "MAI Image 2.6",
        description:
            "Detailed photorealistic generation and single-reference editing with strong instruction following",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1,
    },
    "google/gemini-2.5-flash-image": {
        aliases: ["nanobanana"],
        provider: "google",
        publisher: "Google",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        // Vertex AI model page.
        retirementDate: new Date("2027-03-15").getTime(),
        paidOnly: true,
        priceMultiplier: 1.055,
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
    "google/gemini-3.1-flash-image": {
        aliases: ["nanobanana2", "nanobanana-2"],
        provider: "google",
        publisher: "Google",
        category: "image",
        addedDate: new Date("2026-02-27").getTime(),
        paidOnly: true,
        priceMultiplier: 1.055,
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
    "google/gemini-3.1-flash-lite-image": {
        aliases: ["nanobanana2lite", "nanobanana-lite", "nanobanana-2-lite"],
        provider: "google",
        publisher: "Google",
        category: "image",
        addedDate: new Date("2026-06-30").getTime(),
        paidOnly: true,
        priceMultiplier: 1.055,
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
    "google/gemini-3-pro-image": {
        aliases: ["nanobanana-pro"],
        provider: "google",
        publisher: "Google",
        category: "image",
        addedDate: new Date("2025-12-01").getTime(),
        paidOnly: true,
        priceMultiplier: 1.055,
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
    "bytedance/seedream-5.0-lite": {
        aliases: ["seedream5"],
        provider: "replicate",
        publisher: "ByteDance",
        category: "image",
        addedDate: new Date("2026-02-27").getTime(),
        priceMultiplier: 1,
        perUserRpm: 60,
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
    "bytedance/seedream-5.0-pro": {
        aliases: ["seedream-5-pro", "seedream-pro-5", "seedream5-pro"],
        provider: "replicate",
        publisher: "ByteDance",
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
    "bytedance/seedream-4.0": {
        aliases: ["seedream"],
        provider: "replicate",
        publisher: "ByteDance",
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
    "bytedance/seedream-4.5": {
        aliases: ["seedream-pro"],
        provider: "openrouter",
        publisher: "ByteDance",
        category: "image",
        addedDate: new Date("2025-12-04").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.04 * 1.055, // per image
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
    "ideogram-ai/ideogram-v4-turbo": {
        aliases: ["ideogram-v4-turbo"],
        provider: "replicate",
        publisher: "Ideogram",
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
    "ideogram-ai/ideogram-v4-balanced": {
        aliases: ["ideogram-v4-balanced"],
        provider: "replicate",
        publisher: "Ideogram",
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
    "ideogram-ai/ideogram-v4-quality": {
        aliases: ["ideogram-v4-quality"],
        provider: "replicate",
        publisher: "Ideogram",
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
    "openai/gpt-image-1-mini": {
        aliases: ["gpt-image", "gpt-image-1-mini", "gptimage"],
        provider: "azure",
        publisher: "OpenAI",
        category: "image",
        addedDate: new Date("2025-10-10").getTime(),
        retirementDate: new Date("2027-04-07").getTime(),
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
    "openai/gpt-image-1.5": {
        aliases: ["gpt-image-1.5", "gpt-image-large", "gptimage-large"],
        provider: "azure",
        publisher: "OpenAI",
        category: "image",
        addedDate: new Date("2025-12-23").getTime(),
        retirementDate: new Date("2026-12-16").getTime(),
        priceMultiplier: 0.75,
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
    "openai/gpt-image-2": {
        aliases: ["gpt-image-2"],
        provider: "azure",
        publisher: "OpenAI",
        category: "image",
        addedDate: new Date("2026-04-22").getTime(),
        retirementDate: new Date("2027-10-21").getTime(),
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
    "openai/gpt-image-2.5-flare": {
        aliases: [],
        provider: "azure",
        publisher: "OpenAI",
        category: "image",
        addedDate: new Date("2026-09-08").getTime(),
        // Azure model catalog; the retirement schedule says 2027-09-09.
        retirementDate: new Date("2027-09-08").getTime(),
        paidOnly: true,
        priceMultiplier: 0.75,
        cost: {
            // https://developers.openai.com/api/docs/models/gpt-image-2.5-flare
            promptTextTokens: perMillion(5),
            promptCachedTokens: perMillion(1.25),
            promptImageTokens: perMillion(8),
            completionImageTokens: perMillion(30),
        },
        title: "GPT Image 2.5 Flare",
        description:
            "Fast image generation and precise editing with reference images",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16,
    },
    "openai/gpt-image-2.5-sunburst": {
        aliases: [],
        provider: "azure",
        publisher: "OpenAI",
        category: "image",
        addedDate: new Date("2026-09-08").getTime(),
        // Azure model catalog; the retirement schedule says 2027-09-09.
        retirementDate: new Date("2027-09-08").getTime(),
        paidOnly: true,
        priceMultiplier: 0.75,
        cost: {
            // https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst
            promptTextTokens: perMillion(5),
            promptCachedTokens: perMillion(1.25),
            promptImageTokens: perMillion(8),
            completionImageTokens: perMillion(30),
        },
        title: "GPT Image 2.5 Sunburst",
        description:
            "Detailed image generation with precise control over reference-image edits",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16,
    },
    "black-forest-labs/flux.1-schnell": {
        aliases: ["flux"],
        provider: "vast",
        publisher: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        priceMultiplier: 1,
        perUserRpm: 60,
        cost: {
            completionImageTokens: 0.002, // per image
        },
        title: "FLUX.1 Schnell",
        description: "Fast, high-quality images at a tiny cost",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "tongyi-mai/z-image-turbo": {
        aliases: ["z-image", "z-image-turbo", "zimage"],
        provider: "vast",
        publisher: "Alibaba",
        category: "image",
        addedDate: new Date("2025-12-08").getTime(),
        priceMultiplier: 1,
        perUserRpm: 60,
        cost: {
            completionImageTokens: 0.004, // per image
        },
        title: "Z-Image Turbo",
        description:
            "Instant, budget-friendly images with crisp upscaled output",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "google/veo-3.1-fast": {
        aliases: [
            "veo-3.1-fast",
            "veo-720p",
            "video",
            "veo-1080p",
            "veo-3.1-fast-1080p",
            "veo-1080",
            "veo",
        ],
        provider: "google",
        publisher: "Google",
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
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "720p",
                        "1080p": "1080p",
                    },
                },
            ],
        ),
        resolutions: ["720p", "1080p"],
        title: "Veo 3.1 Fast",
        description: "Fast video with optional audio at 720p or 1080p",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 4,
        maxDuration: 8,
        defaultDuration: 4,
        allowedDurations: [4, 6, 8],
    },
    "google/gemini-omni-1.1-flash": {
        aliases: [],
        provider: "google",
        publisher: "Google",
        category: "video",
        addedDate: new Date("2026-08-28").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // Vertex AI pricing verified 2026-08-28:
        // https://cloud.google.com/vertex-ai/generative-ai/pricing
        cost: {
            promptTextTokens: perMillion(1.5),
            promptImageTokens: perMillion(1.5),
            completionTextTokens: perMillion(9),
            completionVideoTokens: perMillion(17.5),
        },
        resolutions: ["720p", "360p", "1080p", "4k"],
        title: "Gemini Omni 1.1 Flash",
        description:
            "Cinematic video from text or keyframes with synchronized audio at up to 4K",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2,
        minDuration: 3,
        maxDuration: 10,
        defaultDuration: 5,
    },
    "bytedance/seedance-1-pro-fast": {
        aliases: ["seedance-pro"],
        provider: "replicate",
        publisher: "ByteDance",
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
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "720p",
                        "480p": "480p",
                        "1080p": "1080p",
                    },
                },
            ],
        ),
        resolutions: ["720p", "480p", "1080p"],
        title: "Seedance 1.0 Pro Fast",
        description: "Video from text or a start image at 480p, 720p, or 1080p",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
        minDuration: 2,
        maxDuration: 10,
        defaultDuration: 5,
    },
    "bytedance/seedance-2.0": {
        aliases: ["seedance-2", "seedance-2.0"],
        provider: "replicate",
        publisher: "ByteDance",
        category: "video",
        addedDate: new Date("2026-05-07").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // non_video_in tier @ 720p; see Economics' replicate connector guide
        cost: {
            completionVideoSeconds: 0.18,
        },
        ...defineCostVariants(
            {
                video_in: {
                    completionVideoSeconds: 0.22,
                },
            },
            ({ input }) => (input?.hasReferenceVideo ? "video_in" : undefined),
            {
                video_in: {
                    label: "720p with reference video",
                    description:
                        "Applies when the request includes a reference video input.",
                },
            },
            "720p",
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "720p",
                        "video_in": "720p",
                    },
                },
                {
                    "key": "reference_video",
                    "label": "Video input",
                    "values": {
                        "": "No",
                        "video_in": "Yes",
                    },
                },
            ],
        ),
        title: "Seedance 2.0",
        description:
            "720p video with natively synced sound, from text, images, or references",
        inputModalities: ["text", "image", "video", "audio"],
        outputModalities: ["video", "audio"],
        videoCapabilities: [
            "start_frame",
            "end_frame",
            "audio_output",
            "reference_images",
            "reference_videos",
            "reference_audios",
        ],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 4,
        maxDuration: 15,
        defaultDuration: 5,
    },
    "bytedance/seedance-2.0-mini": {
        aliases: ["seedance-2.0-mini"],
        provider: "replicate",
        publisher: "ByteDance",
        category: "video",
        addedDate: new Date("2026-08-14").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Replicate non_video_in tiers: 480p $0.04/s, 720p $0.09/s.
        cost: {
            completionVideoSeconds: 0.09,
        },
        ...defineCostVariants(
            {
                "480p": {
                    completionVideoSeconds: 0.04,
                },
            },
            matchResolution("480p"),
            {
                "480p": {
                    label: "480p",
                    description:
                        "Applies when the requested video resolution is 480p.",
                },
            },
            "720p",
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "720p",
                        "480p": "480p",
                    },
                },
            ],
        ),
        resolutions: ["720p", "480p"],
        title: "Seedance 2.0 Mini",
        description:
            "Lower-cost 4–10 second video with synchronized sound and first/last-frame control at 480p or 720p",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 4,
        maxDuration: 10,
        defaultDuration: 5,
    },
    "bytedance/seedance-2.0-fast": {
        aliases: ["seedance-2.0-fast"],
        provider: "replicate",
        publisher: "ByteDance",
        category: "video",
        addedDate: new Date("2026-08-14").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Replicate non_video_in 480p tier; 720p misses the latency limit.
        cost: {
            completionVideoSeconds: 0.07,
        },
        resolutions: ["480p"],
        title: "Seedance 2.0 Fast",
        description:
            "Short 4–5 second video with synchronized sound and first/last-frame control at 480p",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 4,
        maxDuration: 5,
        defaultDuration: 5,
    },
    "alibaba/wan-2.6": {
        aliases: ["wan2.6", "wan-i2v", "wan"],
        provider: "alibaba",
        publisher: "Alibaba",
        category: "video",
        addedDate: new Date("2026-01-21").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Alibaba wan2.6-t2v / wan2.6-i2v, locked to 720p ($0.10/s). Native audio is bundled
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
        minDuration: 5,
        maxDuration: 15,
        defaultDuration: 5,
        allowedDurations: [5, 10, 15],
    },
    "alibaba/wan-2.2-fast": {
        aliases: ["wan2.2", "wan-2.2", "wan-fast"],
        provider: "replicate",
        publisher: "Alibaba",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Replicate wan-2.2-fast, locked to 480p. Silent, fixed ~5s clip billed
        // flat ($0.01/s x 5s = $0.05).
        cost: {
            promptImageTokens: 0,
            completionVideoSeconds: 0.01, // per sec (480p, silent)
        },
        title: "Wan 2.2",
        description:
            "Cheap 5-second silent clips at 480p — great for quick drafts",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 5,
        maxDuration: 5,
        defaultDuration: 5,
    },
    "alibaba/wan-2.7": {
        aliases: [
            "wan2.7",
            "wan-2.7",
            "wan-pro-1080p",
            "wan2.7-1080p",
            "wan-pro-1080",
            "wan-pro",
        ],
        provider: "replicate",
        publisher: "Alibaba",
        category: "video",
        addedDate: new Date("2026-05-26").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Replicate wan-2.7. Audio is bundled into the per-second rate. T2V and
        // R2V are $0.10/s at both resolutions; I2V is $0.10/s at 720p and
        // $0.15/s at 1080p. R2V never sets hasImage, so it always lands on the
        // base or "1080p" sheet and avoids the I2V surcharge.
        cost: {
            completionVideoSeconds: 0.1, // per sec (720p, includes audio; also R2V)
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
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "720p",
                        "1080p": "1080p",
                        "1080p_image": "1080p",
                    },
                },
                {
                    "key": "input",
                    "label": "Input",
                    "values": {
                        "": "Any",
                        "1080p": "Text/video",
                        "1080p_image": "Image",
                    },
                },
            ],
        ),
        resolutions: ["720p", "1080p"],
        title: "Wan 2.7",
        description:
            "Keyframe-controlled video with sound at 720p or 1080p; also accepts reference images and videos",
        inputModalities: ["text", "image", "video"],
        outputModalities: ["video", "audio"],
        videoCapabilities: [
            "start_frame",
            "end_frame",
            "audio_output",
            "reference_images",
            "reference_videos",
        ],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 2,
        maxDuration: 15,
        defaultDuration: 5,
    },
    "alibaba/wan-3.0": {
        aliases: ["wan-3.0"],
        provider: "alibaba",
        publisher: "Alibaba",
        category: "video",
        addedDate: new Date("2026-08-25").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Alibaba Prime Singapore list rates; input video is also billed.
        cost: {
            promptVideoSeconds: 0.068,
            completionVideoSeconds: 0.068, // per sec at 480p
        },
        ...defineCostVariants(
            {
                "720p": {
                    promptVideoSeconds: 0.14,
                    completionVideoSeconds: 0.14,
                },
                "1080p": {
                    promptVideoSeconds: 0.28,
                    completionVideoSeconds: 0.28,
                },
            },
            matchResolution("720p", "1080p"),
            {
                "720p": {
                    label: "720p",
                    description:
                        "Applies when the requested video resolution is 720p.",
                },
                "1080p": {
                    label: "1080p",
                    description:
                        "Applies when the requested video resolution is 1080p.",
                },
            },
            "480p",
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "480p",
                        "720p": "720p",
                        "1080p": "1080p",
                    },
                },
            ],
        ),
        resolutions: ["480p", "720p", "1080p"],
        title: "Wan 3.0",
        description:
            "Five-second video from text, start/end frames, or reference media with optional audio at 480p, 720p, or 1080p",
        inputModalities: ["text", "image", "video", "audio"],
        outputModalities: ["video", "audio"],
        videoCapabilities: [
            "start_frame",
            "end_frame",
            "audio_output",
            "reference_images",
            "reference_videos",
            "reference_audios",
        ],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 5,
        maxDuration: 5,
        defaultDuration: 5,
    },
    "alibaba/wan-2.7-image": {
        aliases: ["wan2.7-image", "wan-img", "wan-image"],
        provider: "alibaba",
        publisher: "Alibaba",
        category: "image",
        addedDate: new Date("2026-04-02").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // Alibaba Singapore: $0.03 per generated or edited image.
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
    "alibaba/wan-2.7-image-pro": {
        aliases: ["wan2.7-image-pro", "wan-img-pro", "wan-image-pro"],
        provider: "replicate",
        publisher: "Alibaba",
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
    "qwen/qwen-image": {
        aliases: [
            "qwen-image-plus",
            "qwen-image-2512",
            "qwen-image-edit",
            "qwen-image-edit-plus",
            "qwen-image",
        ],
        provider: "replicate",
        publisher: "Qwen",
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
            [
                {
                    "key": "operation",
                    "label": "Operation",
                    "values": {
                        "": "Generation",
                        "edit": "Editing",
                    },
                },
            ],
        ),
        title: "Qwen Image",
        description:
            "Versatile image creation and editing, strong at text inside images",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 3, // DashScope Qwen Image Edit route cap.
    },
    "qwen/qwen-image-2.1": {
        aliases: [],
        provider: "fal",
        publisher: "Qwen",
        category: "image",
        addedDate: new Date("2026-09-20").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // Fal pricing: $0.02 per megapixel for text-to-image and $0.11/3 per
        // megapixel for edits. gen bills the megapixels fal reports. Fal
        // rounds output up to whole megapixels of 2^20 px, adds half a
        // megapixel per reference and doubles edits for the guidance_scale gen
        // sends (measured 2026-09-25). Usage counts millionths of a megapixel
        // (UInt32 usage columns), so perMillion(x) = $x per megapixel.
        cost: {
            completionImageTokens: perMillion(0.02),
        },
        ...defineCostVariants(
            {
                edit: {
                    completionImageTokens: perMillion(0.11 / 3),
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
            [
                {
                    "key": "operation",
                    "label": "Operation",
                    "values": {
                        "": "Generation",
                        "edit": "Editing",
                    },
                },
            ],
        ),
        title: "Qwen Image 2.1",
        description:
            "Generates and edits images from prompts and up to ten references, with accurate text rendering",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10,
    },
    "qwen/qwen-image-3": {
        aliases: ["qwen-image-3"],
        provider: "alibaba",
        publisher: "Qwen",
        category: "image",
        addedDate: new Date("2026-07-23").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            promptImageTokens: 0.003, // per reference image ingested
            completionImageTokens: 0.04, // per image up to 2,250,000 pixels
        },
        ...defineCostVariants(
            {
                "2k": {
                    promptImageTokens: 0.003,
                    completionImageTokens: 0.075,
                },
            },
            ({ input }) =>
                // DashScope bills 2K above 2,250,000 output pixels.
                (input?.megapixels ?? 0) > 2.25 ? "2k" : undefined,
            {
                "2k": {
                    label: "2K",
                    description:
                        "Applies when the requested output exceeds 2,250,000 total pixels (about 1500×1500).",
                },
            },
            "1K",
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "1K",
                        "2k": "2K",
                    },
                },
            ],
        ),
        title: "Qwen Image 3",
        description:
            "Creates and edits detailed images with crisp multilingual text and complex layouts",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 3,
    },
    "x-ai/grok-imagine-image": {
        aliases: ["grok-imagine-image", "grok-imagine"],
        provider: "xai",
        publisher: "xAI",
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
    "x-ai/grok-imagine-image-quality": {
        aliases: [
            "grok-aurora",
            "aurora",
            "grok-imagine-image-quality",
            "grok-imagine-image-pro",
            "grok-imagine-pro",
        ],
        provider: "openrouter",
        publisher: "xAI",
        category: "image",
        addedDate: new Date("2026-03-23").getTime(),
        // xAI retires the slug and redirects it to grok-imagine-image-2.0.
        retirementDate: new Date("2026-11-02").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            promptImageTokens: 0.01 * 1.055, // per input image on edits
            completionImageTokens: 0.05 * 1.055, // per 1K image
        },
        title: "Grok Imagine Pro",
        description:
            "Higher-fidelity photorealistic images for polished results",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1, // OpenRouter image edit route forwards one input image.
    },
    "x-ai/grok-imagine-image-2.0": {
        aliases: ["grok-imagine-image-2.0"],
        provider: "openrouter",
        publisher: "xAI",
        category: "image",
        addedDate: new Date("2026-08-14").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // OpenRouter x-ai/grok-imagine-image-2.0 pricing, verified 2026-08-14.
        cost: {
            promptImageTokens: 0.01 * 1.055,
            completionImageTokens: 0.06 * 1.055, // medium, 1K
        },
        ...defineCostVariants(
            {
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
            ({ input }) => {
                if (input?.quality === "low") {
                    return input.resolution === "2k" ? "low_2k" : "low_1k";
                }
                return input?.resolution === "2k" ? "medium_2k" : undefined;
            },
            {
                low_1k: {
                    label: "Low · 1K",
                    description: "Applies to low-quality 1K requests.",
                },
                low_2k: {
                    label: "Low · 2K",
                    description: "Applies to low-quality 2K requests.",
                },
                medium_2k: {
                    label: "Medium · 2K",
                    description: "Applies to medium-quality 2K requests.",
                },
            },
            "Medium · 1K",
            [
                {
                    "key": "quality",
                    "label": "Quality",
                    "values": {
                        "": "Medium",
                        "low_1k": "Low",
                        "low_2k": "Low",
                        "medium_2k": "Medium",
                    },
                },
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "1K",
                        "low_1k": "1K",
                        "low_2k": "2K",
                        "medium_2k": "2K",
                    },
                },
            ],
        ),
        resolutions: ["1k", "2k"],
        title: "Grok Imagine Image 2.0",
        description:
            "Creates and edits high-detail images at 1K or 2K with up to three references",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 3,
    },
    "recraft/recraft-v4.1-vector": {
        aliases: [
            "recraft-vector",
            "recraft-svg",
            "recraft-v4.1-svg",
            "recraft-v4.1-vector",
        ],
        provider: "openrouter",
        publisher: "Recraft",
        category: "image",
        addedDate: new Date("2026-07-24").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.08 * 1.055, // fixed per output SVG
        },
        title: "Recraft V4.1 Vector",
        description:
            "Editable SVG generation and reference-guided vector design",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1,
    },
    "recraft/recraft-v4.1-flash": {
        aliases: [],
        provider: "openrouter",
        publisher: "Recraft",
        category: "image",
        addedDate: new Date("2026-09-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // OpenRouter bills 4,175 image tokens per image (same convention
            // as Recraft Vector): $0.007 fixed per output image, verified
            // 2026-09-23, plus the mandatory 5.5% OpenRouter credit fee.
            completionImageTokens: 0.007 * 1.055,
        },
        title: "Recraft V4.1 Flash",
        description: "Fast, low-cost raster image generation from text",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "x-ai/grok-imagine-video": {
        aliases: ["grok-imagine-video", "grok-video-pro"],
        provider: "fal",
        publisher: "xAI",
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
        minDuration: 1,
        maxDuration: 15,
        defaultDuration: 5,
    },
    "x-ai/grok-imagine-video-1.5": {
        aliases: ["grok-imagine-video-1.5"],
        provider: "openrouter",
        publisher: "xAI",
        category: "video",
        addedDate: new Date("2026-08-03").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            promptImageTokens: 0.01 * 1.055, // per start-frame image
            completionVideoSeconds: 0.14 * 1.055, // per sec at 720p
        },
        ...defineCostVariants(
            {
                "480p": {
                    completionVideoSeconds: 0.08 * 1.055,
                },
                "1080p": {
                    completionVideoSeconds: 0.25 * 1.055,
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
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "720p",
                        "480p": "480p",
                        "1080p": "1080p",
                    },
                },
            ],
        ),
        resolutions: ["720p", "480p", "1080p"],
        title: "Grok Imagine Video 1.5",
        description:
            "Video from text or a start image with synchronized audio at 480p, 720p, or 1080p",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "audio_output"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
        minDuration: 1,
        maxDuration: 15,
        defaultDuration: 5,
    },
    "bytedance/seedance-2.5": {
        aliases: ["seedance-2.5"],
        provider: "replicate",
        publisher: "ByteDance",
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
                video_in_480p: {
                    completionVideoSeconds: 0.4304,
                },
                video_in_720p: {
                    completionVideoSeconds: 0.9676,
                },
            },
            ({ input }) => {
                if (!input?.hasReferenceVideo) {
                    return input?.resolution === "720p" ? "720p" : undefined;
                }
                return input.resolution === "720p"
                    ? "video_in_720p"
                    : "video_in_480p";
            },
            {
                "720p": {
                    label: "720p",
                    description:
                        "Applies when the requested video resolution is 720p.",
                },
                video_in_480p: {
                    label: "480p with reference video",
                    description:
                        "Applies when the request includes a reference video input at 480p.",
                },
                video_in_720p: {
                    label: "720p with reference video",
                    description:
                        "Applies when the request includes a reference video input at 720p.",
                },
            },
            "480p",
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "480p",
                        "720p": "720p",
                        "video_in_480p": "480p",
                        "video_in_720p": "720p",
                    },
                },
                {
                    "key": "reference_video",
                    "label": "Video input",
                    "values": {
                        "": "No",
                        "720p": "No",
                        "video_in_480p": "Yes",
                        "video_in_720p": "Yes",
                    },
                },
            ],
        ),
        resolutions: ["480p", "720p"],
        title: "Seedance 2.5",
        description:
            "Four-second video with synchronized audio and reference media at 480p or 720p",
        inputModalities: ["text", "image", "video", "audio"],
        outputModalities: ["video", "audio"],
        videoCapabilities: [
            "start_frame",
            "end_frame",
            "audio_output",
            "reference_images",
            "reference_videos",
            "reference_audios",
        ],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 4,
        maxDuration: 4,
        defaultDuration: 4,
    },
    "alibaba/happyhorse-1.1": {
        aliases: ["happyhorse", "happy-horse-1.1", "happyhorse-1.1"],
        provider: "openrouter",
        publisher: "Alibaba",
        category: "video",
        addedDate: new Date("2026-07-18").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.0988 * 1.055, // per sec at 720p
        },
        title: "HappyHorse 1.1",
        description: "Text and first-frame video generation at 720p",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1,
        minDuration: 3,
        maxDuration: 15,
        defaultDuration: 5,
    },
    "minimax/minimax-h3": {
        aliases: ["minimax-h3"],
        provider: "fal",
        publisher: "MiniMax",
        category: "video",
        addedDate: new Date("2026-08-14").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.05, // fal, 480p per second, verified 2026-08-14.
        },
        ...defineCostVariants(
            {
                "768p": { completionVideoSeconds: 0.06 },
                "2k": { completionVideoSeconds: 0.13 },
            },
            matchResolution("768p", "2k"),
            {
                "768p": {
                    label: "768p",
                    description:
                        "Applies when the requested video resolution is 768p.",
                },
                "2k": {
                    label: "2K",
                    description:
                        "Applies when the requested video resolution is 2K.",
                },
            },
            "480p",
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "480p",
                        "768p": "768p",
                        "2k": "2K",
                    },
                },
            ],
        ),
        resolutions: ["480p", "768p", "2k"],
        title: "MiniMax H3",
        description:
            "Five-second text-to-video clips with synchronized stereo audio at 480p, 768p, or 2K",
        inputModalities: ["text"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["audio_output"],
        minDuration: 5,
        maxDuration: 5,
        defaultDuration: 5,
    },
    "minimax/minimax-h3-max": {
        aliases: [],
        provider: "fal",
        publisher: "MiniMax",
        category: "video",
        addedDate: new Date("2026-09-24").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // fal reports resolution-weighted units including reference-media charges.
        // Keep output duration separate; charge the current endpoint price below.
        cost: { completionVideoSeconds: 0 },
        // Retain resolution selection for the catalog and analytics. All
        // resolutions are billed by provider units, not output duration.
        ...defineCostVariants(
            {
                "768p": { completionVideoSeconds: 0 },
                "1080p": { completionVideoSeconds: 0 },
            },
            matchResolution("768p", "1080p"),
            {
                "768p": {
                    label: "768p",
                    description:
                        "768p video billed from provider-reported units.",
                },
                "1080p": {
                    label: "1080p",
                    description:
                        "1080p video billed from provider-reported units.",
                },
            },
            "480p",
            [
                {
                    key: "resolution",
                    label: "Resolution",
                    values: { "": "480p", "768p": "768p", "1080p": "1080p" },
                },
            ],
        ),
        billing: {
            adjustments: [
                {
                    id: "fal.minimax_h3_max.provider_units.v1",
                    description:
                        "Provider cost including resolution and reference media",
                    kind: "video",
                    unit: "provider unit",
                    unitCost: 1,
                    publicPricing: {
                        label: "Provider cost",
                        quantity: 1,
                        unit: "USD",
                    },
                    countUnits: (_output, input) =>
                        input?.providerBilling?.units ?? 0,
                    resolveUnitCost: (_output, _model, input) =>
                        input?.providerBilling?.unitCost ?? 0,
                },
            ],
        },
        resolutions: ["480p", "768p", "1080p"],
        title: "MiniMax H3 Max",
        description:
            "High-quality 5–15 second video from text, start/end frames, or reference media with synchronized audio at 480p, 768p, or 1080p",
        inputModalities: ["text", "image", "video", "audio"],
        outputModalities: ["video", "audio"],
        videoCapabilities: [
            "start_frame",
            "end_frame",
            "audio_output",
            "reference_images",
            "reference_videos",
            "reference_audios",
        ],
        maxReferenceImages: 2,
        minDuration: 5,
        maxDuration: 15,
        defaultDuration: 5,
        allowedDurations: [5, 10, 15],
    },
    "minimax/minimax-h3-max-turbo": {
        aliases: [],
        provider: "fal",
        publisher: "MiniMax",
        category: "video",
        addedDate: new Date("2026-09-04").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // fal list rates (launch promotion ends 2026-09-30), verified 2026-09-25.
        cost: {
            completionVideoSeconds: 0.025, // 480p per output second.
        },
        ...defineCostVariants(
            {
                "768p": { completionVideoSeconds: 0.04 },
                "1080p": { completionVideoSeconds: 0.08 },
            },
            matchResolution("768p", "1080p"),
            {
                "768p": {
                    label: "768p",
                    description:
                        "Applies when the requested video resolution is 768p.",
                },
                "1080p": {
                    label: "1080p",
                    description:
                        "Applies when the requested video resolution is 1080p.",
                },
            },
            "480p",
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "480p",
                        "768p": "768p",
                        "1080p": "1080p",
                    },
                },
            ],
        ),
        resolutions: ["480p", "768p", "1080p"],
        title: "MiniMax H3 Max Turbo",
        description:
            "Fast 5–15 second video with synchronized audio and first/last-frame control at 480p, 768p, or 1080p",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2,
        minDuration: 5,
        maxDuration: 15,
        defaultDuration: 5,
        allowedDurations: [5, 10, 15],
    },
    "black-forest-labs/flux.2-klein-4b": {
        aliases: ["flux-klein", "klein"],
        provider: "vast",
        publisher: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2026-01-17").getTime(),
        priceMultiplier: 1,
        perUserRpm: 60,
        cost: {
            completionImageTokens: 0.005,
        },
        title: "FLUX.2 Klein 4B",
        description: "Fast image generation and editing up to 2.4 megapixels",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10, // Pollinations self-hosted route cap.
    },
    "prunaai/p-image": {
        aliases: ["pruna-image", "pruna", "p-image"],
        provider: "deepinfra",
        publisher: "Pruna",
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
    "prunaai/p-image-edit": {
        aliases: ["pruna-edit", "pruna-image-edit", "p-image-edit"],
        provider: "deepinfra",
        publisher: "Pruna",
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
    "prunaai/p-video": {
        aliases: [
            "pruna-video",
            "p-video-720p",
            "p-video-1080p",
            "pruna-video-1080p",
            "p-video",
        ],
        provider: "replicate",
        publisher: "Pruna",
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
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "720p",
                        "1080p": "1080p",
                    },
                },
            ],
        ),
        resolutions: ["720p", "1080p"],
        title: "Pruna p-video",
        description: "Affordable video from text or an image at 720p or 1080p",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
        minDuration: 1,
        maxDuration: 10,
        defaultDuration: 5,
    },
    "amazon/nova-canvas-v1": {
        aliases: ["amazon-nova-canvas", "nova-canvas"],
        provider: "aws",
        publisher: "Amazon",
        category: "image",
        addedDate: new Date("2026-03-23").getTime(),
        // Bedrock Legacy endOfLifeTime.
        retirementDate: new Date("2026-09-30T08:00:00Z").getTime(),
        priceMultiplier: 1,
        // AWS Cost Explorer Nova Canvas Standard meters, verified 2026-08-24.
        cost: {
            completionImageTokens: 0.04, // per image
        },
        ...defineCostVariants(
            {
                "2048": {
                    completionImageTokens: 0.06, // per image when either side exceeds 1024px
                },
            },
            ({ input }) =>
                (input?.maxImageDimension ?? 0) > 1024 ? "2048" : undefined,
            {
                "2048": {
                    label: "2048 tier",
                    description:
                        "Applies when either output dimension exceeds 1024 pixels.",
                },
            },
            "1024 tier",
            [
                {
                    "key": "image_size",
                    "label": "Max side",
                    "unit": "px",
                    "values": {
                        "2048": ">1024",
                        "": "≤1024",
                    },
                },
            ],
        ),
        title: "Nova Canvas",
        description: "Image generation with editing and inpainting tools",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1, // Nova Canvas route forwards one input image.
    },
    "amazon/nova-reel-v1": {
        aliases: ["amazon-nova-reel", "nova-reel"],
        provider: "aws",
        publisher: "Amazon",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        // Bedrock Legacy endOfLifeTime.
        retirementDate: new Date("2026-09-30T08:00:00Z").getTime(),
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
        minDuration: 6,
        maxDuration: 120,
        defaultDuration: 6,
        durationStep: 6,
    },
} as const satisfies Record<string, ModelDefinition>;

export const IMAGE_SERVICES = mergeFallbacks(
    IMAGE_BASE_SERVICES,
    IMAGE_FALLBACKS,
);

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
