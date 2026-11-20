import { defineCostVariants, matchResolution } from "./cost-variants";
import { IMAGE_FALLBACKS } from "./image-fallbacks";
import { mergeFallbacks } from "./merge-fallbacks";
import { perMillion } from "./price-helpers";
import type { BillingRules, ModelDefinition } from "./registry";

export const DEFAULT_IMAGE_MODEL = "tongyi-mai/z-image-turbo" as const;
export const HOTSHOT_XL_MODEL = "hotshotco/hotshot-xl" as const;
export const HOTSHOT_XL_SIDE_LENGTH = 512;
// https://replicate.com/pricing (shared Nvidia L40S)
export const HOTSHOT_XL_GPU_SECOND_COST = 0.000975;
const FLUX3_LAUNCH_DISCOUNT_END = Date.parse("2026-10-08T15:00:00Z");

// The fal fallback reports its complete USD charge, without token counts.
const GPT_IMAGE_26_BILLING: BillingRules = {
    adjustments: [
        {
            id: "fal.gpt_image_2_6.provider_units.v1",
            description: "Fallback provider charge instead of token billing",
            kind: "image",
            unit: "provider unit",
            unitCost: 1,
            publicPricing: {
                label: "Fallback provider cost",
                quantity: 1,
                unit: "USD",
            },
            countUnits: (_output, input) => input?.providerBilling?.units ?? 0,
            resolveUnitCost: (_output, _model, input) =>
                input?.providerBilling?.unitCost ?? 1,
        },
    ],
};

export type ImageModelName = keyof typeof IMAGE_SERVICES;

const IMAGE_BASE_SERVICES = {
    [HOTSHOT_XL_MODEL]: {
        aliases: [],
        provider: "replicate",
        publisher: "Hotshot",
        category: "image",
        addedDate: new Date("2026-11-19").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        flatRate: false,
        cost: {},
        billing: {
            adjustments: [
                {
                    id: "replicate.hotshot_xl.gpu_seconds.v1",
                    description: "Replicate GPU processing time",
                    kind: "image",
                    unit: "GPU second",
                    unitCost: HOTSHOT_XL_GPU_SECOND_COST,
                    publicPricing: {
                        label: "GPU processing time",
                        quantity: 1,
                        unit: "GPU second",
                    },
                    countUnits: (_output, input) =>
                        input?.providerBilling?.units ?? 0,
                },
            ],
        },
        title: "Hotshot-XL",
        description:
            "Generate a short 512×512 animated GIF from a text prompt.",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "stability-ai/stable-diffusion-3.5-large": {
        aliases: ["sd3.5-large"],
        provider: "aws",
        publisher: "Stability AI",
        category: "image",
        addedDate: new Date("2026-11-19").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: { completionImageTokens: 0.08 },
        title: "Stable Diffusion 3.5 Large",
        description:
            "Create an image from a description, or give an existing picture a new style.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1,
    },
    "stability-ai/stable-image-core": {
        aliases: ["stable-image-core"],
        provider: "aws",
        publisher: "Stability AI",
        category: "image",
        addedDate: new Date("2026-11-19").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: { completionImageTokens: 0.04 },
        title: "Stable Image Core",
        description:
            "Turn a description into an image of about two megapixels.",
        inputModalities: ["text"],
        outputModalities: ["image"],
        maxReferenceImages: 0,
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
            "Create illustrations in a style you describe, with clear lettering for titles and posters.",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "lykon/dreamshaper-8-lcm": {
        // Kept for the legacy image proxy worker, which calls it as "sana", and
        // for existing callers: hidden from the catalog, still served.
        aliases: ["sana", "dreamshaper"],
        hidden: true,
        provider: "vast",
        publisher: "Lykon",
        category: "image",
        addedDate: new Date("2026-07-30").getTime(),
        priceMultiplier: 1,
        paidOnly: false,
        perUserRpm: 300,
        cost: {
            completionImageTokens: 0.0001, // per image
        },
        title: "DreamShaper 8 LCM",
        description:
            "Sketch out a visual idea quickly before spending time on finer details.",
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
        paidOnly: false,
        cost: {
            completionImageTokens: 0.04, // per image
        },
        title: "FLUX.1 Kontext Pro",
        description:
            "Edit a picture in plain language to replace an object, change its style, or refine a detail.",
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
            "Generate images at the dimensions you choose. Reuse a seed to repeat a result.",
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
        priceUnits: {
            promptImageTokens: { unit: "megapixel" },
            completionImageTokens: { unit: "megapixel" },
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
            "Build a detailed image from a description and up to eight reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 8, // Azure FLUX.2 Pro route limit.
    },
    "black-forest-labs/flux-3-image": {
        aliases: [],
        provider: "openrouter",
        publisher: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2026-10-02").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // https://bfl.ai/pricing: 50% launch discount ends Oct 8 at 15:00 UTC.
        // Read rates at request time so warm workers also quote the cutover.
        // Settlement always uses OpenRouter's reported cost plus its 5.5% fee.
        cost: {
            get completionImageTokens() {
                return (
                    (Date.now() < FLUX3_LAUNCH_DISCOUNT_END ? 0.024 : 0.048) *
                    1.055
                );
            },
        },
        ...defineCostVariants(
            {
                "2k": {
                    get completionImageTokens() {
                        return (
                            (Date.now() < FLUX3_LAUNCH_DISCOUNT_END
                                ? 0.05
                                : 0.1) * 1.055
                        );
                    },
                },
            },
            matchResolution("2k"),
            {
                "2k": {
                    label: "2K",
                    description:
                        "Applies when the requested image resolution is 2K.",
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
        resolutions: ["1k", "2k"],
        title: "FLUX.3 Image",
        description:
            "Create or edit a 1K or 2K image using up to ten reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10,
    },
    "black-forest-labs/flux-3-image-klein": {
        aliases: [],
        provider: "fal",
        publisher: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2026-10-15").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // fal pricing (2026-10-18): $0.009 per billed unit. fal bills BFL's
        // per-image tiers in these units (1K = 1, 4K = 4), so price = fal's
        // charge. Usage counts millionths of a unit.
        cost: {
            completionImageTokens: perMillion(0.009),
        },
        priceUnits: {
            completionImageTokens: { unit: "megapixel", quantity: 1_000_000 },
        },
        title: "FLUX.3 Image Klein",
        description:
            "Create an image up to 4K or guide an edit with up to ten reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10,
    },
    "black-forest-labs/flux.2-flex": {
        aliases: ["flux-2-flex"],
        provider: "azure",
        publisher: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2026-08-31").getTime(),
        priceMultiplier: 0.75,
        // Azure 25 RPM covers more than twice the observed 10 RPM peak.
        paidOnly: false,
        // Azure Global Standard pricing, verified 2026-08-31. Azure rounds
        // input and output megapixels up to whole billable units.
        cost: {
            promptImageTokens: 0.05,
            completionImageTokens: 0.05,
        },
        priceUnits: {
            promptImageTokens: { unit: "megapixel" },
            completionImageTokens: { unit: "megapixel" },
        },
        title: "FLUX.2 Flex",
        description:
            "Create designs with readable lettering, or adjust how closely an edit follows your instructions.",
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
        priceUnits: {
            promptImageTokens: { unit: "megapixel" },
            completionImageTokens: { unit: "megapixel" },
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
            "Combine details from several reference pictures while keeping subjects consistent in the finished image.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 8, // Replicate and OpenRouter both cap the API at 8 reference images.
    },
    "microsoft/mai-image-2.6-flash": {
        aliases: ["microsoft/mai-image-2.5-flash"],
        provider: "azure",
        publisher: "Microsoft",
        category: "image",
        addedDate: new Date("2026-09-22").getTime(),
        // Provider retires this route on 2027-01-09.
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
            "Create or edit realistic pictures with readable text, such as a label on a product.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 5, // Azure MAI edits accept 1 to 5 `image` parts.
    },
    "microsoft/mai-image-2.6": {
        aliases: [],
        provider: "azure",
        publisher: "Microsoft",
        category: "image",
        addedDate: new Date("2026-09-23").getTime(),
        // Provider retires this route on 2027-01-09.
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
            "Build a realistic scene from detailed instructions and up to five reference images.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 5, // Azure MAI edits accept 1 to 5 `image` parts.
    },
    "microsoft/mai-image-2.7": {
        aliases: [],
        provider: "azure",
        publisher: "Microsoft",
        category: "image",
        addedDate: new Date("2026-11-17").getTime(),
        paidOnly: false,
        priceMultiplier: 0.75,
        perUserRpm: 12,
        // Azure rates as listed by the Azure provider on OpenRouter and Vercel, checked 2026-11-17.
        cost: {
            promptTextTokens: perMillion(5),
            promptImageTokens: perMillion(8),
            completionImageTokens: perMillion(34),
        },
        title: "MAI Image 2.7",
        description:
            "Describe precise changes to an image and guide the edit with up to five reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 5, // Azure MAI edits accept 1 to 5 `image` parts.
    },
    "microsoft/mai-image-2.7-flash": {
        aliases: [],
        provider: "azure",
        publisher: "Microsoft",
        category: "image",
        addedDate: new Date("2026-11-17").getTime(),
        paidOnly: false,
        priceMultiplier: 0.75,
        perUserRpm: 12,
        // Azure rates as listed by the Azure provider on OpenRouter and Vercel, checked 2026-11-17.
        cost: {
            promptTextTokens: perMillion(1.75),
            promptImageTokens: perMillion(2.5),
            completionImageTokens: perMillion(10),
        },
        title: "MAI Image 2.7 Flash",
        description:
            "Quickly try changes to an image using a description and up to five reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 5, // Azure MAI edits accept 1 to 5 `image` parts.
    },
    "google/gemini-2.5-flash-image": {
        aliases: ["nanobanana"],
        provider: "google",
        publisher: "Google",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        // Vertex AI model page.
        // Provider retires this route on 2027-03-15.
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
            "Create an image or quickly revise one by describing what to change.",
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
        priceMultiplier: 1,
        cost: {
            // Gemini 3.1 Flash Image via Vertex AI
            promptCachedTokens: perMillion(0.05),
            promptTextTokens: perMillion(0.5), // per 1M tokens
            promptImageTokens: perMillion(0.5), // per 1M tokens
            completionTextTokens: perMillion(3), // text/reasoning output tokens
            completionImageTokens: perMillion(60), // per 1M tokens, 2520 tokens/image
        },
        title: "Nano Banana 2",
        description:
            "Create or edit images with sharp details and legible lettering.",
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
        priceMultiplier: 1,
        cost: {
            // Gemini 3.1 Flash-Lite Image (GA) via Vertex AI — half of nanobanana-2
            promptCachedTokens: perMillion(0.025),
            promptTextTokens: perMillion(0.25), // per 1M tokens
            promptImageTokens: perMillion(0.25), // per 1M tokens
            completionTextTokens: perMillion(1.5), // text/reasoning output tokens
            completionImageTokens: perMillion(30), // per 1M tokens, 1120 tokens/1K image = $0.0336
        },
        title: "Nano Banana 2 Lite",
        description:
            "Quickly draft an image or try several small edits to a picture.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Pollinations cap for Gemini 3.1 Flash-Lite Image route.
    },
    "google/gemini-nano-banana-2.1": {
        aliases: [],
        provider: "google",
        publisher: "Google",
        category: "image",
        addedDate: new Date("2026-10-06").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // Vertex global standard pricing; cached input includes images.
            promptTextTokens: perMillion(1.5),
            promptImageTokens: perMillion(1.5),
            promptCachedTokens: perMillion(0.15),
            completionTextTokens: perMillion(7.5),
            completionImageTokens: perMillion(30),
        },
        title: "Nano Banana 2.1",
        description:
            "Create or edit an image up to 2K using a description and reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Gemini Nano Banana 2.1 provider limit.
    },
    "google/gemini-3-pro-image": {
        aliases: ["nanobanana-pro"],
        provider: "google",
        publisher: "Google",
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
            promptCachedTokens: perMillion(0.2),
            completionTextTokens: perMillion(12), // text/reasoning output tokens
            completionImageTokens: perMillion(120), // per 1M tokens, 1120 tokens per 1K image
        },
        title: "Nano Banana Pro",
        description: "Turn a complex brief into a detailed image up to 4K.",
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
            "Create or edit 2K and 3K images with built-in visual reasoning for detailed instructions and reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Pollinations route cap from Replicate schema.
    },
    "bytedance/seedream-5.0-flash": {
        aliases: [],
        provider: "openrouter",
        publisher: "ByteDance",
        category: "image",
        addedDate: new Date("2026-10-02").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // OpenRouter Seed endpoint, verified 2026-10-05: a flat $0.018 per
            // image at both 1K and 2K, plus the 5.5% credit fee.
            completionImageTokens: 0.018 * 1.055, // per image
        },
        ...defineCostVariants(
            {
                "2k": { completionImageTokens: 0.018 * 1.055 },
            },
            matchResolution("2k"),
            {
                "2k": {
                    label: "2K",
                    description:
                        "Applies when the requested image resolution is 2K.",
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
        resolutions: ["1k", "2k"],
        title: "Seedream 5.0 Flash",
        description:
            "Create a 1K or 2K image from a description and up to ten reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10,
    },
    "bytedance/seedream-5.0-pro": {
        aliases: ["seedream-5-pro", "seedream-pro-5", "seedream5-pro"],
        provider: "vercel",
        publisher: "ByteDance",
        category: "image",
        addedDate: new Date("2026-07-10").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.035, // per 2K image; settle from gateway receipt
        },
        title: "Seedream 5.0 Pro",
        description:
            "Combine details from up to ten reference pictures to create or edit a 2K image.",
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
        description:
            "Turn a description into a realistic scene or use reference pictures to guide an edit.",
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
        description:
            "Create lifelike scenes and portraits with up to fourteen reference pictures to guide the details.",
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
        description:
            "Quickly turn a headline or slogan into an image with crisp lettering.",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "ideogram-ai/ideogram-vector-1": {
        aliases: [],
        provider: "fal",
        publisher: "Ideogram",
        category: "image",
        addedDate: Date.parse("2026-11-19"),
        priceMultiplier: 1,
        paidOnly: true,
        cost: { completionImageTokens: 0.01 }, // fal reports integer cents as billable units.
        title: "Ideogram Vector 1",
        description:
            "Create editable SVG artwork from a prompt and up to five reference images.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 5,
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
        description:
            "Create posters and other designs that balance readable lettering with image detail.",
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
            "Create detailed artwork with carefully rendered lettering for a finished design.",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "openai/gpt-image-1-mini": {
        aliases: ["gpt-image", "gpt-image-1-mini", "gptimage"],
        provider: "azure",
        publisher: "OpenAI",
        category: "image",
        addedDate: new Date("2025-10-10").getTime(),
        // Provider retires this route on 2027-04-07.
        priceMultiplier: 1,
        // Quest overflow spills onto the cash OpenAI fallback.
        paidOnly: true,
        cost: {
            promptTextTokens: perMillion(2.0), // per 1M tokens
            promptCachedTokens: perMillion(0.2), // per 1M tokens
            promptImageTokens: perMillion(2.5), // per 1M tokens
            completionImageTokens: perMillion(8), // per 1M tokens
        },
        title: "GPT Image 1 Mini",
        description:
            "Draft images or try everyday edits, such as changing the background of a picture.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16, // GPT Image edit endpoint accepts up to 16 input images.
        supportsTransparency: true,
    },
    "openai/gpt-image-1.5": {
        aliases: ["gpt-image-1.5", "gpt-image-large", "gptimage-large"],
        provider: "azure",
        publisher: "OpenAI",
        category: "image",
        addedDate: new Date("2025-12-23").getTime(),
        // Provider retires this route on 2026-12-16.
        priceMultiplier: 1,
        // Quest overflow spills onto the cash OpenAI fallback.
        paidOnly: true,
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
            "Create a detailed image or describe a small change to make in an existing picture.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16, // GPT Image edit endpoint accepts up to 16 input images.
        supportsTransparency: true,
    },
    "openai/gpt-image-2": {
        aliases: ["gpt-image-2"],
        provider: "azure",
        publisher: "OpenAI",
        category: "image",
        addedDate: new Date("2026-04-22").getTime(),
        // Provider retires this route on 2027-10-21.
        // Quest overflow spills onto the cash OpenAI fallback.
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            promptTextTokens: perMillion(5), // per 1M tokens
            promptCachedTokens: perMillion(1.25), // per 1M tokens
            promptImageTokens: perMillion(8), // per 1M tokens
            completionImageTokens: perMillion(30), // per 1M tokens
        },
        title: "GPT Image 2",
        description:
            "Turn detailed instructions into a high-resolution image or use them to edit a picture.",
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
        // Provider retires this route on 2027-09-08.
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
            "Quickly draft images and use reference pictures to guide targeted changes.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16,
        supportsTransparency: true,
    },
    "openai/gpt-image-2.5-sunburst": {
        aliases: [],
        provider: "azure",
        publisher: "OpenAI",
        category: "image",
        addedDate: new Date("2026-09-08").getTime(),
        // Azure model catalog; the retirement schedule says 2027-09-09.
        // Provider retires this route on 2027-09-08.
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
            "Build a detailed scene or use a reference picture to guide a precise edit.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16,
        supportsTransparency: true,
    },
    "openai/gpt-image-2.6-flare": {
        aliases: [],
        provider: "openai",
        publisher: "OpenAI",
        category: "image",
        cacheVersion: "preserve-output-format-v1",
        addedDate: new Date("2026-11-05").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // https://developers.openai.com/api/docs/models/gpt-image-2.6-flare
            promptTextTokens: perMillion(5),
            promptCachedTokens: perMillion(1.25),
            promptImageTokens: perMillion(8),
            completionImageTokens: perMillion(30),
        },
        billing: GPT_IMAGE_26_BILLING,
        title: "GPT Image 2.6 Flare",
        description:
            "Quickly generate or edit an image while keeping details from your reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16,
        supportsTransparency: true,
    },
    "openai/gpt-image-2.6-sunburst": {
        aliases: [],
        provider: "openai",
        publisher: "OpenAI",
        category: "image",
        addedDate: new Date("2026-11-05").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst
            promptTextTokens: perMillion(5),
            promptCachedTokens: perMillion(1.25),
            promptImageTokens: perMillion(8),
            completionImageTokens: perMillion(30),
        },
        billing: GPT_IMAGE_26_BILLING,
        title: "GPT Image 2.6 Sunburst",
        description:
            "Arrange a detailed scene and refine individual elements while preserving details from your references.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16,
        supportsTransparency: true,
    },
    "black-forest-labs/flux.1-schnell": {
        aliases: ["flux"],
        provider: "vast",
        publisher: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        priceMultiplier: 1,
        paidOnly: false,
        perUserRpm: 60,
        cost: {
            completionImageTokens: 0.002, // per image
        },
        title: "FLUX.1 Schnell",
        description:
            "Turn text into quick image drafts to explore several ideas.",
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
        paidOnly: false,
        perUserRpm: 60,
        cost: {
            completionImageTokens: 0.004, // per image
        },
        title: "Z-Image Turbo",
        description:
            "Quickly generate a sharp image from a description using built-in upscaling.",
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
        // Omitted size/audio used to give portrait video with billed audio.
        cacheVersion: "2026-09-30-landscape-audio-opt-in",
        title: "Veo 3.1 Fast",
        description:
            "Create a short video from text or opening and closing images, with optional sound.",
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
            "Create up to 10 seconds of video with synchronized sound at up to 4K, from text or opening and closing images.",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2,
        minDuration: 3,
        maxDuration: 10,
        defaultDuration: 5,
    },
    "google/gemini-omni-1.2-flash": {
        aliases: [],
        provider: "google",
        publisher: "Google",
        category: "video",
        addedDate: new Date("2026-11-05").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // Vertex AI pricing verified 2026-11-05:
        // https://cloud.google.com/model-garden/pricing
        // Video output is priced per token: 1931, 5792, 8688 and 17376 tokens per
        // second at 360p, 720p, 1080p and 4k (with audio).
        cost: {
            promptTextTokens: perMillion(1.5),
            promptImageTokens: perMillion(1.5),
            completionTextTokens: perMillion(9),
            completionVideoTokens: perMillion(12),
        },
        resolutions: ["720p", "360p", "1080p", "4k"],
        title: "Gemini Omni 1.2 Flash",
        description:
            "Create up to 15 seconds of video with synchronized sound at up to 4K, from text or opening and closing images.",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2,
        minDuration: 3,
        maxDuration: 15,
        defaultDuration: 5,
    },
    "bytedance/seedance-1-pro-fast": {
        aliases: ["seedance-pro"],
        provider: "fal",
        publisher: "ByteDance",
        category: "video",
        addedDate: new Date("2025-12-04").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // fal bills $1 per 1M video tokens (2026-10-24); these are the 16:9
        // per-second equivalents. Charges use fal's reported units at its
        // live endpoint price, and fal doesn't charge input images.
        cost: {
            promptImageTokens: 0,
            completionVideoSeconds: 0.021021, // per sec at 720p
        },
        ...defineCostVariants(
            {
                "480p": {
                    completionVideoSeconds: 0.0099225,
                },
                "1080p": {
                    completionVideoSeconds: 0.0486,
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
        description:
            "Animate a starting image or describe a short video up to 1080p.",
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
        resolutions: ["720p"],
        title: "Seedance 2.0",
        description:
            "Create a 720p video with synchronized sound. Guide it with reference images, video, or audio.",
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
            "Choose opening and closing images for a clip up to ten seconds long with synchronized sound.",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 4,
        // Replicate allows 15 s; capped at the verified synchronous latency limit.
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
            "Animate opening and closing images into a four- or five-second clip with synchronized sound.",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 4,
        // Replicate allows 15 s; capped at the verified synchronous latency limit.
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
        resolutions: ["720p"],
        title: "Wan 2.6",
        description:
            "Turn a description or starting image into a 720p video with sound lasting five, ten, or fifteen seconds.",
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
        provider: "fal",
        publisher: "Alibaba",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Fal wan-2.2-turbo, locked to 480p. Silent, fixed ~5s clip billed
        // flat ($0.01/s x 5s = $0.05). Primary moved off Replicate, which
        // returned 4xx on ~48% of requests (31 req, 15 errors_4xx,
        // 2026-10-21 /models/status); Replicate stays as a fallback-only route.
        cost: {
            promptImageTokens: 0,
            completionVideoSeconds: 0.01, // per sec (480p, silent)
        },
        resolutions: ["480p"],
        title: "Wan 2.2",
        description:
            "Draft a five-second silent clip using text or images for the opening and closing frames.",
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
            "Create video with sound using opening and closing images or visual references from pictures and clips.",
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
            "Guide a clip with images, video, or audio references and choose whether to include sound.",
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
        minDuration: 2,
        maxDuration: 15,
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
            "Create an image up to 2K or edit an existing picture by describing the change.",
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
            "Create or edit a detailed 4K image from a description and reference pictures.",
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
            "Create or edit images with readable words on signs, labels, and other objects.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 3, // Replicate qwen-image-edit-plus works best with 1 to 3.
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
        priceUnits: {
            completionImageTokens: { unit: "megapixel", quantity: 1_000_000 },
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
            "Create or edit a design with readable lettering and up to ten reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10,
    },
    "qwen/qwen-image-2.1-turbo": {
        aliases: [],
        provider: "alibaba",
        publisher: "Qwen",
        category: "image",
        addedDate: new Date("2026-10-11").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // Alibaba Singapore (International) list price (2026-10-13): $0.016 per
        // output image, whatever the reference image count.
        cost: {
            completionImageTokens: 0.016, // per image
        },
        title: "Qwen Image 2.1 Turbo",
        description:
            "Quickly try image variations using a description and up to ten reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10,
    },
    "qwen/qwen-image-2.1-pro": {
        aliases: [],
        provider: "alibaba",
        publisher: "Qwen",
        category: "image",
        addedDate: new Date("2026-10-18").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // Alibaba Singapore (International) list price (2026-10-18): $0.04 per
        // output image. Beijing and the global regions list $0.035333.
        cost: {
            completionImageTokens: 0.04, // per image
        },
        title: "Qwen Image 2.1 Pro",
        description:
            "Create a new scene or guide an edit by combining up to ten reference images.",
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
            "Create or edit intricate layouts with crisp text in multiple languages.",
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
        description:
            "Create realistic images or quickly edit a photo by describing the change.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 5, // xAI image edits accept up to 5 `images`.
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
        // Provider retires this route on 2026-11-02.
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            promptImageTokens: 0.01 * 1.055, // per input image on edits
            completionImageTokens: 0.05 * 1.055, // per 1K image
        },
        title: "Grok Imagine Pro",
        description:
            "Create detailed, lifelike images from a description or up to three reference pictures.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 3, // OpenRouter input_references limit.
    },
    "x-ai/grok-imagine-image-2.0": {
        aliases: ["grok-imagine-image-2.0"],
        provider: "xai",
        publisher: "xAI",
        category: "image",
        addedDate: new Date("2026-08-14").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // xAI direct API rates; a low 1K probe cost $0.04 (2026-10-24).
        cost: {
            promptImageTokens: 0.01,
            completionImageTokens: 0.06, // medium, 1K
        },
        ...defineCostVariants(
            {
                low_1k: {
                    promptImageTokens: 0.01,
                    completionImageTokens: 0.04,
                },
                low_2k: {
                    promptImageTokens: 0.01,
                    completionImageTokens: 0.06,
                },
                medium_2k: {
                    promptImageTokens: 0.01,
                    completionImageTokens: 0.08,
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
            "Create or edit a detailed 1K or 2K image with up to three reference pictures.",
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
            "Turn text or a reference picture into an editable SVG that stays sharp at any size.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1,
    },
    "quiverai/arrow-2": {
        aliases: [],
        provider: "quiverai",
        publisher: "QuiverAI",
        category: "image",
        addedDate: Date.parse("2026-11-19"),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            promptTextTokens: perMillion(4),
            completionTextTokens: perMillion(20),
        },
        title: "Arrow 2",
        description:
            "Generate editable SVG illustrations, icons, and diagrams from text and reference images.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14,
    },
    "recraft/recraft-v4.1-flash": {
        aliases: [],
        provider: "fal",
        publisher: "Recraft",
        category: "image",
        addedDate: new Date("2026-09-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // fal recraft/v4.1/flash/text-to-image: $0.007 per image, one
            // billable unit per image (probe, 2026-10-24).
            completionImageTokens: 0.007,
        },
        title: "Recraft V4.1 Flash",
        description:
            "Turn a written brief into a quick illustration for a design draft.",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "x-ai/grok-imagine-video": {
        aliases: ["grok-imagine-video", "grok-video-pro"],
        provider: "replicate",
        publisher: "xAI",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            promptImageTokens: 0, // included in output-video price
            completionVideoSeconds: 0.07, // per reported output second at 720p
        },
        resolutions: ["720p"],
        title: "Grok Video Pro",
        description:
            "Turn a prompt or starting image into a 720p video up to fifteen seconds long.",
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
        provider: "xai",
        publisher: "xAI",
        category: "video",
        addedDate: new Date("2026-08-03").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // xAI direct API rates; a 1 s 480p probe cost $0.08 (2026-10-24).
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
            "Animate an opening image or describe a scene to create video with synchronized sound.",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "audio_output"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
        minDuration: 1,
        maxDuration: 15,
        defaultDuration: 5,
    },
    "x-ai/grok-imagine-video-1.5-lite": {
        aliases: [],
        provider: "xai",
        publisher: "xAI",
        category: "video",
        addedDate: new Date("2026-10-06").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // xAI direct API rates (docs.x.ai, 2026-10-06).
            promptImageTokens: 0.01, // per start-frame image
            completionVideoSeconds: 0.03, // per sec at 720p
        },
        ...defineCostVariants(
            {
                "480p": {
                    completionVideoSeconds: 0.02,
                },
                "1080p": {
                    completionVideoSeconds: 0.14,
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
        title: "Grok Imagine Video 1.5 Lite",
        description:
            "Quickly draft a video up to 1080p from text or a starting image.",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
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
            "Create a four-second clip with synchronized sound, or use a reference video to guide an edit.",
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
        billedSecondsFollowReference: true,
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
        resolutions: ["720p"],
        title: "HappyHorse 1.1",
        description:
            "Turn a description or opening image into a 720p clip up to fifteen seconds long.",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1,
        minDuration: 3,
        maxDuration: 15,
        defaultDuration: 5,
        // OpenRouter bills at least 5 seconds per clip.
        minBilledSeconds: 5,
    },
    "kwaivgi/kling-v3.0-std": {
        aliases: [],
        provider: "fal",
        publisher: "Kuaishou",
        category: "video",
        addedDate: new Date("2026-09-19").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // fal.ai kling-video/v3/standard direct published rates (2026-09-22).
        // No OpenRouter credit fee: fal is the only route (#15176 review
        // found OpenRouter applies a 5-second billing minimum and returns
        // 1080p for a requested 720p, so it is not a compatible fallback).
        // Base is $0.084/s silent; audio adds $0.042/s ($0.126/s with audio).
        cost: {
            completionVideoSeconds: 0.084, // per sec at 720p
            completionAudioSeconds: 0.042, // per sec when audio is enabled
        },
        resolutions: ["720p"],
        title: "Kling 3.0 Standard",
        description:
            "Guide a 720p clip with opening and closing images and add synchronized sound.",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 3,
        maxDuration: 15,
        defaultDuration: 5,
    },
    "kwaivgi/kling-v3.0-pro": {
        aliases: [],
        provider: "fal",
        publisher: "Kuaishou",
        category: "video",
        addedDate: new Date("2026-11-13").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.112,
            completionAudioSeconds: 0.056,
        },
        resolutions: ["1080p"],
        title: "Kling 3.0 Pro",
        description:
            "1080p video from text or start and end frames with optional synchronized audio",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2,
        minDuration: 3,
        maxDuration: 15,
        defaultDuration: 5,
    },
    "lightricks/ltx-2.5-pro": {
        aliases: [],
        provider: "fal",
        publisher: "Lightricks",
        category: "video",
        addedDate: new Date("2026-11-13").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: { completionVideoSeconds: 0.12 },
        ...defineCostVariants(
            { "1080p": { completionVideoSeconds: 0.17 } },
            matchResolution("1080p"),
            { "1080p": { label: "1080p", description: "Output at 1080p." } },
            "720p",
            [
                {
                    key: "resolution",
                    label: "Resolution",
                    values: { "": "720p", "1080p": "1080p" },
                },
            ],
        ),
        resolutions: ["720p", "1080p"],
        title: "LTX 2.5 Pro",
        description:
            "High-fidelity video at 720p or 1080p with synchronized audio and optional start and end frames",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2,
        minDuration: 6,
        maxDuration: 10,
        defaultDuration: 6,
        allowedDurations: [6, 8, 10],
    },
    "black-forest-labs/flux-3-max": {
        aliases: [],
        provider: "fal",
        publisher: "Black Forest Labs",
        category: "video",
        addedDate: new Date("2026-10-20").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // fal.ai FLUX 3 Max promotional per-second rates (2026-10-20), 75% off
        // through 2026-11-07. List after the promotion: $0.17/s at 720p and
        // $0.29/s at 1080p (follow-up PR). fal's page lists no separate audio rate.
        cost: { completionVideoSeconds: 0.0425 },
        ...defineCostVariants(
            {
                "1080p": { completionVideoSeconds: 0.0725 },
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
                    key: "resolution",
                    label: "Resolution",
                    values: { "": "720p", "1080p": "1080p" },
                },
            ],
        ),
        resolutions: ["720p", "1080p"],
        title: "FLUX 3 Max",
        description:
            "Create a video up to twenty seconds long with optional sound and control over its opening and closing images.",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
        minDuration: 5,
        maxDuration: 20,
        defaultDuration: 5,
    },
    "heygen/heygen-video-1": {
        aliases: [],
        provider: "fal",
        publisher: "HeyGen",
        category: "video",
        addedDate: new Date("2026-09-30").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // fal heygen/heygen-video: $0.01/s at 480p and 768p until 2026-10-31,
        // then $0.02/s (2026-10-24). Charges use fal's reported units at its
        // live endpoint price, and fal doesn't charge the first frame.
        cost: {
            promptImageTokens: 0,
            completionVideoSeconds: 0.01, // per sec at 480p
        },
        ...defineCostVariants(
            {
                "768p": { completionVideoSeconds: 0.01 },
            },
            matchResolution("768p"),
            {
                "768p": {
                    label: "768p",
                    description:
                        "Applies when the requested video resolution is 768p.",
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
                    },
                },
            ],
        ),
        resolutions: ["480p", "768p"],
        title: "HeyGen Video 1",
        description:
            "Create a video from text or an opening image, complete with dialogue, background sounds, and effects.",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "audio_output"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
        minDuration: 5,
        maxDuration: 15,
        defaultDuration: 5,
    },
    "minimax/minimax-h3-image": {
        aliases: ["minimax-h3-image"],
        provider: "fal",
        publisher: "MiniMax",
        category: "image",
        addedDate: new Date("2026-11-18").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            promptTextTokens: perMillion(2.3),
            promptImageTokens: perMillion(1.5),
            completionImageTokens: perMillion(3.8),
        },
        // Resolution changes the token count. Each route keeps its own base rates.
        ...defineCostVariants(
            { "2k": {}, "4k": {} },
            matchResolution("2k", "4k"),
            {
                "2k": {
                    label: "2K",
                    description: "2K output at the base token rates.",
                },
                "4k": {
                    label: "4K",
                    description: "4K output at the base token rates.",
                },
            },
            "1K",
            [
                {
                    key: "resolution",
                    label: "Resolution",
                    values: { "": "1K", "2k": "2K", "4k": "4K" },
                },
            ],
        ),
        // Both adapters report the base USD charge before gateway fees.
        billing: {
            resolveTotalCost: (_output, input) => input?.providerBilling?.units,
        },
        resolutions: ["1k", "2k", "4k"],
        title: "MiniMax H3 Image",
        description:
            "Generate images up to 4K and combine up to 16 references in a single edit",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16,
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
            "Turn a description into a five-second clip with synchronized stereo sound.",
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
            "Guide a video with images, clips, or audio references to create a scene with synchronized sound.",
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
        // fal reports resolution-weighted units for the selected resolution.
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
                    id: "fal.minimax_h3_max_turbo.provider_units.v1",
                    description:
                        "Provider cost including the selected resolution",
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
        title: "MiniMax H3 Max Turbo",
        description:
            "Quickly turn opening and closing images into a clip up to fifteen seconds long with synchronized sound.",
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
        paidOnly: false,
        perUserRpm: 60,
        cost: {
            completionImageTokens: 0.005,
        },
        title: "FLUX.2 Klein 4B",
        description:
            "Quickly generate or edit an image up to 2.4 megapixels using reference pictures.",
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
        title: "P-Image",
        description:
            "Try out visual ideas quickly by turning short descriptions into image drafts.",
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
        title: "P-Image-Edit",
        description:
            "Quickly edit a photo by describing what to change, such as a color or background.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 5, // Pollinations route cap.
    },
    "inferenceport-ai/lightning-image-turbo": {
        aliases: [],
        provider: "inferenceport",
        publisher: "InferencePort",
        category: "image",
        addedDate: new Date("2026-09-12").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        perUserRpm: 15,
        cost: {
            completionImageTokens: 0.02, // per image
        },
        title: "Lightning Image Turbo",
        description:
            "Use up to two reference pictures to guide the image you describe.",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 2,
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
        title: "P-Video",
        description:
            "Turn a description or opening image into a short 720p or 1080p video.",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
        minDuration: 1,
        maxDuration: 10,
        defaultDuration: 5,
    },
    "kandinskylab/kandinsky-6.0-lite": {
        aliases: [],
        provider: "fal",
        publisher: "Kandinsky Lab",
        category: "video",
        addedDate: new Date("2026-10-11").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // fal.ai list prices for one 5-second 480p video at the default 10
        // steps. Charges use fal's reported units at its live endpoint price.
        cost: {
            completionVideoSeconds: 0.032, // $0.16 per video
        },
        ...defineCostVariants(
            {
                start_image: {
                    completionVideoSeconds: 0.034, // $0.17 per video
                },
            },
            ({ input }) => (input?.hasImage ? "start_image" : undefined),
            {
                start_image: {
                    label: "From a start image",
                    description:
                        "Applies when the request includes a start image.",
                },
            },
            "From text",
            [
                {
                    key: "input",
                    label: "Input",
                    values: { "": "Text", start_image: "Image" },
                },
            ],
        ),
        resolutions: ["480p"],
        title: "Kandinsky 6.0 Lite",
        description:
            "Animate an opening image or describe a scene for a five-second clip with synchronized sound.",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "audio_output"],
        maxReferenceImages: 1,
        minDuration: 5,
        maxDuration: 5,
        defaultDuration: 5,
    },
    "mirelo/sfx-2.0": {
        aliases: [],
        provider: "fal",
        publisher: "Mirelo AI",
        category: "video",
        addedDate: new Date("2026-10-15").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // fal's price per returned second: $0.010 during Mirelo's launch
        // promo, $0.015 from 2026-12-14. Charges use fal's reported seconds at
        // its live endpoint price.
        cost: { completionVideoSeconds: 0.01 },
        // The output keeps the source video's dimensions.
        resolutions: ["source"],
        title: "Mirelo SFX 2.0",
        description:
            "Add sound effects to an existing video that match the action on screen.",
        inputModalities: ["text", "video"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["reference_videos", "audio_output"],
        maxReferenceVideos: 1,
        // Up to the first 120 seconds of the source; fal bills the seconds it returns.
        minDuration: 1,
        maxDuration: 120,
        defaultDuration: 120,
        billedSecondsFollowReference: true,
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
