import { perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

export const DEFAULT_IMAGE_MODEL = "zimage" as const;

export type ImageModelName = keyof typeof IMAGE_SERVICES;
export type ImageModelId = (typeof IMAGE_SERVICES)[ImageModelName]["modelId"];

export const IMAGE_SERVICES = {
    "kontext": {
        aliases: [],
        modelId: "kontext",
        provider: "azure",
        brand: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        cost: {
            completionImageTokens: 0.04, // per image
        },
        description: "FLUX.1 Kontext - In-context editing & generation",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "nanobanana": {
        aliases: [],
        modelId: "nanobanana",
        provider: "google",
        brand: "Google",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // Gemini 2.5 Flash Image via Vertex AI
            promptTextTokens: perMillion(0.3), // per 1M tokens
            promptImageTokens: perMillion(0.3), // per 1M tokens
            completionImageTokens: perMillion(30), // per 1M tokens, 1290 tokens/image
        },
        description: "NanoBanana - Fast image generation & editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "nanobanana-2": {
        aliases: ["nanobanana2"],
        modelId: "nanobanana-2",
        provider: "google",
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
        description:
            "NanoBanana 2 - Image generation & editing with sharper detail",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "nanobanana-pro": {
        aliases: [],
        modelId: "nanobanana-pro",
        provider: "google",
        brand: "Google",
        category: "image",
        addedDate: new Date("2025-12-01").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // Gemini 3 Pro Image via Vertex AI
            // 1K/2K image: 1120 tokens = $0.134/image ($120/M tokens)
            // 4K image: 2000 tokens = $0.24/image
            promptTextTokens: perMillion(1.25), // per 1M tokens
            promptImageTokens: perMillion(1.25), // per 1M tokens
            completionTextTokens: perMillion(12), // text/reasoning output tokens
            completionImageTokens: perMillion(120), // per 1M tokens, 1120 tokens per 1K image
        },
        description: "NanoBanana Pro - Gemini 3 Pro Image (4K, Thinking)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "seedream5": {
        aliases: [],
        modelId: "seedream5",
        provider: "bytedance",
        brand: "ByteDance",
        category: "image",
        addedDate: new Date("2026-02-27").getTime(),
        paidOnly: true,
        cost: {
            completionImageTokens: 0.035, // per image
        },
        description:
            "Seedream 5.0 Lite - Image generation with web search & reasoning",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "seedream": {
        aliases: [],
        modelId: "seedream",
        provider: "bytedance",
        brand: "ByteDance",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        paidOnly: true,
        cost: {
            completionImageTokens: 0.03, // per image
        },
        description: "Seedream 4.0 - Photorealistic image generation (legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "seedream-pro": {
        aliases: [],
        modelId: "seedream-pro",
        provider: "bytedance",
        brand: "ByteDance",
        category: "image",
        addedDate: new Date("2025-12-04").getTime(),
        paidOnly: true,
        cost: {
            completionImageTokens: 0.04, // per image
        },
        description:
            "Seedream 4.5 Pro - Premium photorealistic image generation (legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
        provider: "azure",
        brand: "OpenAI",
        category: "image",
        addedDate: new Date("2025-10-10").getTime(),
        cost: {
            promptTextTokens: perMillion(2.0), // per 1M tokens
            promptCachedTokens: perMillion(0.2), // per 1M tokens
            promptImageTokens: perMillion(2.5), // per 1M tokens
            completionImageTokens: perMillion(8), // per 1M tokens
        },
        description: "GPT Image 1 Mini - Fast & affordable image generation",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "gptimage-large": {
        aliases: ["gpt-image-1.5", "gpt-image-large"],
        modelId: "gptimage-large",
        provider: "azure",
        brand: "OpenAI",
        category: "image",
        addedDate: new Date("2025-12-23").getTime(),
        cost: {
            // Official pricing: https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-openai%E2%80%99s-gpt-image-1-5-in-microsoft-foundry/4478139
            promptTextTokens: perMillion(5), // per 1M tokens
            promptCachedTokens: perMillion(1.25), // per 1M tokens
            promptImageTokens: perMillion(8), // per 1M tokens
            completionTextTokens: perMillion(10), // per 1M tokens
            completionImageTokens: perMillion(32), // per 1M tokens
        },
        description: "GPT Image 1.5 - High-fidelity image generation & editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "gpt-image-2": {
        aliases: [],
        modelId: "gpt-image-2",
        provider: "openai",
        brand: "OpenAI",
        category: "image",
        addedDate: new Date("2026-04-22").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            promptTextTokens: perMillion(5), // per 1M tokens
            promptCachedTokens: perMillion(1.25), // per 1M tokens
            promptImageTokens: perMillion(8), // per 1M tokens
            completionImageTokens: perMillion(30), // per 1M tokens
        },
        description:
            "GPT Image 2 - Premium high-resolution image generation & editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "flux": {
        aliases: [],
        modelId: "flux",
        provider: "runpod",
        brand: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        cost: {
            completionImageTokens: 0.001, // per image
        },
        description: "Flux Schnell - Fast high-quality image generation",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "zimage": {
        aliases: ["z-image", "z-image-turbo"],
        modelId: "zimage",
        provider: "runpod",
        brand: "Alibaba",
        category: "image",
        addedDate: new Date("2025-12-08").getTime(),
        cost: {
            completionImageTokens: 0.002, // per image
        },
        description: "Z-Image Turbo - Fast 6B Flux with 2x upscaling",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "veo": {
        aliases: ["veo-3.1-fast", "video"],
        modelId: "veo",
        provider: "google",
        brand: "Google",
        category: "video",
        addedDate: new Date("2025-11-27").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            completionVideoSeconds: 0.15, // per sec
        },
        description: "Veo 3.1 Fast - Fast text-to-video with audio (preview)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
    },
    "seedance": {
        aliases: [],
        modelId: "seedance",
        provider: "bytedance",
        brand: "ByteDance",
        category: "video",
        addedDate: new Date("2025-12-01").getTime(),
        paidOnly: true,
        cost: {
            // Token formula: (height × width × FPS × duration) / 1024
            completionVideoTokens: perMillion(1.8), // per 1M tokens
        },
        description:
            "Seedance Lite - BytePlus video generation (better quality)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame"],
    },
    "seedance-pro": {
        aliases: [],
        modelId: "seedance-pro",
        provider: "bytedance",
        brand: "ByteDance",
        category: "video",
        addedDate: new Date("2025-12-04").getTime(),
        paidOnly: true,
        cost: {
            // Token formula: (height × width × FPS × duration) / 1024
            completionVideoTokens: perMillion(1.0), // per 1M tokens
        },
        description:
            "Seedance Pro-Fast - BytePlus video generation (better prompt adherence)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
    },
    "seedance-2.0": {
        aliases: ["seedance-2"],
        modelId: "seedance-2.0",
        provider: "replicate",
        brand: "ByteDance",
        category: "video",
        addedDate: new Date("2026-05-07").getTime(),
        paidOnly: true,
        // non_video_in tier @ 720p; see provider-billing/providers/replicate.md
        cost: {
            completionVideoSeconds: 0.18,
        },
        description:
            "Seedance 2.0 - ByteDance multimodal video gen via Replicate (720p, native audio)",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
    },
    "wan": {
        aliases: ["wan2.6", "wan-i2v"],
        modelId: "wan",
        provider: "alibaba",
        brand: "Alibaba",
        category: "video",
        addedDate: new Date("2026-01-21").getTime(),
        paidOnly: true,
        cost: {
            // Using I2V+audio rate as base since T2V also generates audio; audio cost split out separately for tracking
            completionVideoSeconds: 0.05, // per sec
            completionAudioSeconds: 0.05, // per sec
        },
        description:
            "Wan 2.6 - Alibaba text/image-to-video with audio (2-15s, up to 1080P) via DashScope",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "audio_output"],
    },
    "wan-fast": {
        aliases: ["wan2.2", "wan-2.2"],
        modelId: "wan-fast",
        provider: "alibaba",
        brand: "Alibaba",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.01, // per sec
            completionAudioSeconds: 0.01, // per sec
        },
        description:
            "Wan 2.2 - Fast & cheap text/image-to-video (5s, 480P) via DashScope",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame"],
    },
    "wan-image": {
        aliases: ["wan2.7-image", "wan-img"],
        modelId: "wan-image",
        provider: "alibaba",
        brand: "Alibaba",
        category: "image",
        addedDate: new Date("2026-04-02").getTime(),
        priceMultiplier: 1.5,
        cost: {
            completionImageTokens: 0.035, // per image
        },
        description:
            "Wan 2.7 Image - Alibaba text-to-image and image editing (up to 2K)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "wan-image-pro": {
        aliases: ["wan2.7-image-pro", "wan-img-pro"],
        modelId: "wan-image-pro",
        provider: "alibaba",
        brand: "Alibaba",
        category: "image",
        addedDate: new Date("2026-04-02").getTime(),
        paidOnly: true,
        cost: {
            completionImageTokens: 0.075, // per image
        },
        description:
            "Wan 2.7 Image Pro - Alibaba text-to-image and editing (4K, thinking mode)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "qwen-image": {
        aliases: [
            "qwen-image-plus",
            "qwen-image-2512",
            "qwen-image-edit",
            "qwen-image-edit-plus",
        ],
        modelId: "qwen-image",
        provider: "alibaba",
        brand: "Qwen",
        category: "image",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1.5,
        cost: {
            completionImageTokens: 0.03, // per image
        },
        description:
            "Qwen Image Plus - Alibaba text-to-image and image editing via DashScope",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "grok-imagine": {
        aliases: ["grok-imagine-image"],
        modelId: "grok-imagine",
        provider: "xai",
        brand: "xAI",
        category: "image",
        addedDate: new Date("2026-02-25").getTime(),
        paidOnly: true,
        cost: {
            completionImageTokens: 0.02, // per image
        },
        description: "Grok Imagine - Photorealistic image generation",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "grok-imagine-pro": {
        aliases: ["grok-aurora", "aurora", "grok-imagine-image-pro"],
        modelId: "grok-imagine-pro",
        provider: "xai",
        brand: "xAI",
        category: "image",
        addedDate: new Date("2026-03-23").getTime(),
        paidOnly: true,
        cost: {
            completionImageTokens: 0.07, // per image
        },
        description:
            "Grok Imagine Pro - xAI official pro image generation (Aurora)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "grok-video-pro": {
        aliases: ["grok-imagine-video"],
        modelId: "grok-video-pro",
        provider: "xai",
        brand: "xAI",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.05, // per sec at 720p
        },
        description:
            "Grok Video Pro - xAI official video generation (720p, 1-15s)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
    },
    "klein": {
        aliases: ["flux-klein"],
        modelId: "klein",
        provider: "runpod",
        brand: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2026-01-17").getTime(),
        alpha: true,
        cost: {
            completionImageTokens: 0.01,
        },
        description: "FLUX.2 Klein 4B - Fast image generation and editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "ltx-2": {
        aliases: ["ltx2", "ltx-2.3", "ltxvideo", "ltx-video"],
        modelId: "ltx-2",
        provider: "lambda",
        brand: "Lightricks",
        category: "video",
        addedDate: new Date("2026-02-06").getTime(),
        alpha: true,
        cost: {
            completionVideoSeconds: 0.005,
        },
        description:
            "LTX-2.3 - Fast text/image-to-video generation with upscaler",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
    },
    "p-image": {
        aliases: ["pruna-image", "pruna"],
        modelId: "p-image",
        provider: "pruna",
        brand: "Pruna",
        category: "image",
        addedDate: new Date("2026-03-14").getTime(),
        paidOnly: true,
        cost: {
            completionImageTokens: 0.005, // per image
        },
        description: "Pruna p-image - Fast text-to-image generation",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "p-image-edit": {
        aliases: ["pruna-edit", "pruna-image-edit"],
        modelId: "p-image-edit",
        provider: "pruna",
        brand: "Pruna",
        category: "image",
        addedDate: new Date("2026-03-14").getTime(),
        paidOnly: true,
        cost: {
            completionImageTokens: 0.01, // per image
        },
        description: "Pruna p-image-edit - Image-to-image editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "p-video": {
        aliases: ["pruna-video"],
        modelId: "p-video",
        provider: "pruna",
        brand: "Pruna",
        category: "video",
        addedDate: new Date("2026-03-14").getTime(),
        paidOnly: true,
        cost: {
            // $0.12 per run / 5s default = $0.024/sec
            completionVideoSeconds: 0.024, // per sec
        },
        description:
            "Pruna p-video - Text/image-to-video generation (up to 1080p)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
    },
    "nova-canvas": {
        aliases: ["amazon-nova-canvas"],
        modelId: "nova-canvas",
        provider: "aws",
        brand: "Amazon",
        category: "image",
        addedDate: new Date("2026-03-23").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            completionImageTokens: 0.04, // per image
        },
        description: "Nova Canvas - Image generation, editing & inpainting",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "nova-reel": {
        aliases: ["amazon-nova-reel"],
        modelId: "nova-reel",
        provider: "aws",
        brand: "Amazon",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        cost: {
            completionVideoSeconds: 0.08, // per sec
        },
        description: "Nova Reel - Video Generation (6-120s, 720p)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
    },
} as const satisfies Record<string, ModelDefinition<string>>;
