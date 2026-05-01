import { COST_START_DATE, perMillion } from "./price-helpers";
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
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.04, // per image
            },
        ],
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
        paidOnly: true,
        cost: [
            // Gemini 2.5 Flash Image via Vertex AI
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.3), // per 1M tokens
                promptImageTokens: perMillion(0.3), // per 1M tokens
                completionImageTokens: perMillion(30), // per 1M tokens, 1290 tokens/image
            },
        ],
        description: "NanoBanana - Gemini 2.5 Flash Image",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "nanobanana-2": {
        aliases: ["nanobanana2"],
        modelId: "nanobanana-2",
        provider: "google",
        brand: "Google",
        category: "image",
        paidOnly: true,
        cost: [
            // Gemini 3.1 Flash Image via Vertex AI
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.5), // per 1M tokens
                promptImageTokens: perMillion(0.5), // per 1M tokens
                completionTextTokens: perMillion(3), // text/reasoning output tokens
                completionImageTokens: perMillion(60), // per 1M tokens, 2520 tokens/image
            },
        ],
        description: "NanoBanana 2 - Gemini 3.1 Flash Image",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "nanobanana-pro": {
        aliases: [],
        modelId: "nanobanana-pro",
        provider: "google",
        brand: "Google",
        category: "image",
        paidOnly: true,
        cost: [
            // Gemini 3 Pro Image via Vertex AI
            // 1K/2K image: 1120 tokens = $0.134/image ($120/M tokens)
            // 4K image: 2000 tokens = $0.24/image
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.25), // per 1M tokens
                promptImageTokens: perMillion(1.25), // per 1M tokens
                completionTextTokens: perMillion(12), // text/reasoning output tokens
                completionImageTokens: perMillion(120), // per 1M tokens, 1120 tokens per 1K image
            },
        ],
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
        paidOnly: true,
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.035, // per image
            },
        ],
        price: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.0525, // per image
            },
        ],
        description:
            "Seedream 5.0 Lite - ByteDance ARK (web search, reasoning)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "seedream": {
        aliases: [],
        modelId: "seedream",
        provider: "bytedance",
        brand: "ByteDance",
        category: "image",
        paidOnly: true,
        hidden: true,
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.03, // per image
            },
        ],
        price: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.045, // per image
            },
        ],
        description: "Seedream 4.0 - ByteDance ARK (legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "seedream-pro": {
        aliases: [],
        modelId: "seedream-pro",
        provider: "bytedance",
        brand: "ByteDance",
        category: "image",
        paidOnly: true,
        hidden: true,
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.04, // per image
            },
        ],
        price: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.06, // per image
            },
        ],
        description: "Seedream 4.5 Pro - ByteDance ARK (legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
        provider: "azure",
        brand: "OpenAI",
        category: "image",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.0), // per 1M tokens
                promptCachedTokens: perMillion(0.2), // per 1M tokens
                promptImageTokens: perMillion(2.5), // per 1M tokens
                completionImageTokens: perMillion(8), // per 1M tokens
            },
        ],
        description: "GPT Image 1 Mini - OpenAI's image generation model",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "gptimage-large": {
        aliases: ["gpt-image-1.5", "gpt-image-large"],
        modelId: "gptimage-large",
        provider: "azure",
        brand: "OpenAI",
        category: "image",
        cost: [
            // Official pricing: https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-openai%E2%80%99s-gpt-image-1-5-in-microsoft-foundry/4478139
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(5), // per 1M tokens
                promptCachedTokens: perMillion(1.25), // per 1M tokens
                promptImageTokens: perMillion(8), // per 1M tokens
                completionTextTokens: perMillion(10), // per 1M tokens
                completionImageTokens: perMillion(32), // per 1M tokens
            },
        ],
        description: "GPT Image 1.5 - OpenAI's advanced image generation model",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "gpt-image-2": {
        aliases: [],
        modelId: "gpt-image-2",
        provider: "openai",
        brand: "OpenAI",
        category: "image",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(5), // per 1M tokens
                promptCachedTokens: perMillion(1.25), // per 1M tokens
                promptImageTokens: perMillion(8), // per 1M tokens
                completionImageTokens: perMillion(30), // per 1M tokens
            },
        ],
        description: "GPT Image 2 - OpenAI's next-gen image generation model",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "flux": {
        aliases: [],
        modelId: "flux",
        provider: "runpod",
        brand: "Black Forest Labs",
        category: "image",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.001, // per image
            },
        ],
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
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.002, // per image
            },
        ],
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
        paidOnly: true,
        cost: [
            {
                date: COST_START_DATE,
                completionVideoSeconds: 0.15, // per sec
            },
        ],
        description: "Veo 3.1 Fast - Google's video generation model (preview)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
    "seedance": {
        aliases: [],
        modelId: "seedance",
        provider: "bytedance",
        brand: "ByteDance",
        category: "video",
        paidOnly: true,
        cost: [
            // Token formula: (height × width × FPS × duration) / 1024
            {
                date: COST_START_DATE,
                completionVideoTokens: perMillion(1.8), // per 1M tokens
            },
        ],
        price: [
            {
                date: COST_START_DATE,
                completionVideoTokens: perMillion(2.7), // per 1M tokens
            },
        ],
        description:
            "Seedance Lite - BytePlus video generation (better quality)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
    "seedance-pro": {
        aliases: [],
        modelId: "seedance-pro",
        provider: "bytedance",
        brand: "ByteDance",
        category: "video",
        paidOnly: true,
        cost: [
            // Token formula: (height × width × FPS × duration) / 1024
            {
                date: COST_START_DATE,
                completionVideoTokens: perMillion(1.0), // per 1M tokens
            },
        ],
        price: [
            {
                date: COST_START_DATE,
                completionVideoTokens: perMillion(1.5), // per 1M tokens
            },
        ],
        description:
            "Seedance Pro-Fast - BytePlus video generation (better prompt adherence)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
    "wan": {
        aliases: ["wan2.6", "wan-i2v"],
        modelId: "wan",
        provider: "alibaba",
        brand: "Alibaba",
        category: "video",
        paidOnly: true,
        cost: [
            // Using I2V+audio rate as base since T2V also generates audio; audio cost split out separately for tracking
            {
                date: new Date("2026-02-20").getTime(),
                completionVideoSeconds: 0.05, // per sec
                completionAudioSeconds: 0.05, // per sec
            },
        ],
        price: [
            {
                date: new Date("2026-02-20").getTime(),
                completionVideoSeconds: 0.075, // per sec
                completionAudioSeconds: 0.075, // per sec
            },
        ],
        description:
            "Wan 2.6 - Alibaba text/image-to-video with audio (2-15s, up to 1080P) via DashScope",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
    "wan-fast": {
        aliases: ["wan2.2", "wan-2.2"],
        modelId: "wan-fast",
        provider: "alibaba",
        brand: "Alibaba",
        category: "video",
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-03-23").getTime(),
                completionVideoSeconds: 0.01, // per sec
                completionAudioSeconds: 0.01, // per sec
            },
        ],
        price: [
            {
                date: new Date("2026-03-23").getTime(),
                completionVideoSeconds: 0.015, // per sec
                completionAudioSeconds: 0.015, // per sec
            },
        ],
        description:
            "Wan 2.2 - Fast & cheap text/image-to-video (5s, 480P) via DashScope",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
    "wan-image": {
        aliases: ["wan2.7-image", "wan-img"],
        modelId: "wan-image",
        provider: "alibaba",
        brand: "Alibaba",
        category: "image",
        cost: [
            {
                date: new Date("2026-04-02").getTime(),
                completionImageTokens: 0.035, // per image
            },
        ],
        price: [
            {
                date: new Date("2026-04-02").getTime(),
                completionImageTokens: 0.0525, // per image
            },
        ],
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
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-04-02").getTime(),
                completionImageTokens: 0.075, // per image
            },
        ],
        price: [
            {
                date: new Date("2026-04-02").getTime(),
                completionImageTokens: 0.1125, // per image
            },
        ],
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
        cost: [
            {
                date: new Date("2026-03-22").getTime(),
                completionImageTokens: 0.03, // per image
            },
        ],
        price: [
            {
                date: new Date("2026-03-22").getTime(),
                completionImageTokens: 0.045, // per image
            },
        ],
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
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-03-22").getTime(),
                completionImageTokens: 0.02, // per image
            },
        ],
        price: [
            {
                date: new Date("2026-03-22").getTime(),
                completionImageTokens: 0.03, // per image
            },
        ],
        description: "Grok Imagine - xAI official image generation",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "grok-imagine-pro": {
        aliases: ["grok-aurora", "aurora", "grok-imagine-image-pro"],
        modelId: "grok-imagine-pro",
        provider: "xai",
        brand: "xAI",
        category: "image",
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-03-22").getTime(),
                completionImageTokens: 0.07, // per image
            },
        ],
        price: [
            {
                date: new Date("2026-03-22").getTime(),
                completionImageTokens: 0.105, // per image
            },
        ],
        description:
            "Grok Imagine Pro - xAI official pro image generation (Aurora)",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "grok-video-pro": {
        aliases: ["grok-imagine-video"],
        modelId: "grok-video-pro",
        provider: "xai",
        brand: "xAI",
        category: "video",
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-03-22").getTime(),
                completionVideoSeconds: 0.05, // per sec at 720p
            },
        ],
        price: [
            {
                date: new Date("2026-03-22").getTime(),
                completionVideoSeconds: 0.075, // per sec at 720p
            },
        ],
        description:
            "Grok Video Pro - xAI official video generation (720p, 1-15s)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
    "klein": {
        aliases: ["flux-klein"],
        modelId: "klein",
        provider: "runpod",
        brand: "Black Forest Labs",
        category: "image",
        alpha: true,
        cost: [
            {
                date: new Date("2026-01-21").getTime(), // Launch date
                completionImageTokens: 0.01,
            },
        ],
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
        alpha: true,
        cost: [
            {
                date: new Date("2026-03-23").getTime(),
                completionVideoSeconds: 0.005,
            },
        ],
        description: "LTX-2.3 - Fast text-to-video generation with upscaler",
        inputModalities: ["text"],
        outputModalities: ["video"],
    },
    "p-image": {
        aliases: ["pruna-image", "pruna"],
        modelId: "p-image",
        provider: "pruna",
        brand: "Pruna",
        category: "image",
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-03-13").getTime(),
                completionImageTokens: 0.005, // per image
            },
        ],
        price: [
            {
                date: new Date("2026-03-13").getTime(),
                completionImageTokens: 0.0075, // per image
            },
        ],
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
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-03-13").getTime(),
                completionImageTokens: 0.01, // per image
            },
        ],
        price: [
            {
                date: new Date("2026-03-13").getTime(),
                completionImageTokens: 0.015, // per image
            },
        ],
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
        paidOnly: true,
        cost: [
            // $0.12 per run / 5s default = $0.024/sec
            {
                date: new Date("2026-03-13").getTime(),
                completionVideoSeconds: 0.024, // per sec
            },
        ],
        price: [
            {
                date: new Date("2026-03-13").getTime(),
                completionVideoSeconds: 0.036, // per sec
            },
        ],
        description:
            "Pruna p-video - Text/image-to-video generation (up to 1080p)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
    "nova-canvas": {
        aliases: ["amazon-nova-canvas"],
        modelId: "nova-canvas",
        provider: "aws",
        brand: "Amazon",
        category: "image",
        paidOnly: true,
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.04, // per image
            },
        ],
        description: "Nova Canvas - Bedrock Image Generation & Editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "nova-reel": {
        aliases: ["amazon-nova-reel"],
        modelId: "nova-reel",
        provider: "aws",
        brand: "Amazon",
        category: "video",
        cost: [
            {
                date: COST_START_DATE,
                completionVideoSeconds: 0.08, // per sec
            },
        ],
        description: "Nova Reel - Bedrock Video Generation (6-120s, 720p)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
} as const satisfies Record<string, ModelDefinition<string>>;
