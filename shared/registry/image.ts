import { COST_START_DATE, perMillion } from "./price-helpers";
import type { ServiceDefinition } from "./registry";

export const DEFAULT_IMAGE_MODEL = "zimage" as const;

export type ImageServiceId = keyof typeof IMAGE_SERVICES;
export type ImageModelId = (typeof IMAGE_SERVICES)[ImageServiceId]["modelId"];

export const IMAGE_SERVICES = {
    "kontext": {
        aliases: [],
        modelId: "kontext",
        provider: "azure",
        paidOnly: true,
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.04, // $0.04 per image (Azure pricing)
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
        paidOnly: true,
        cost: [
            // Gemini 2.5 Flash Image via Vertex AI
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.3), // $0.30 per 1M input tokens
                promptImageTokens: perMillion(0.3), // $0.30 per 1M input tokens
                completionImageTokens: perMillion(30), // $30 per 1M tokens × 1290 tokens/image = $0.039 per image
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
        paidOnly: true,
        cost: [
            // Gemini 3.1 Flash Image via Vertex AI
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.5), // $0.50 per 1M input tokens
                promptImageTokens: perMillion(0.5), // $0.50 per 1M input tokens
                completionImageTokens: perMillion(60), // $60 per 1M tokens × 2520 tokens/image = $0.151 per image
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
        paidOnly: true,
        cost: [
            // Gemini 3 Pro Image via Vertex AI
            // 1K/2K image: 1120 tokens = $0.134/image ($120/M tokens)
            // 4K image: 2000 tokens = $0.24/image
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.25), // $1.25 per 1M input tokens
                promptImageTokens: perMillion(1.25), // $1.25 per 1M input tokens
                completionImageTokens: perMillion(120), // $120 per 1M tokens = $0.134 per 1K image
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
        paidOnly: true,
        cost: [
            // ByteDance ARK Seedream 5.0 Lite - $0.035 per image
            {
                date: COST_START_DATE,
                completionImageTokens: 0.035, // $0.035 per image (3.5 cents)
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
        paidOnly: true,
        hidden: true,
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.03, // $0.03 per image (real 4.0)
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
        paidOnly: true,
        hidden: true,
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.04, // $0.04 per image (real 4.5)
            },
        ],
        description: "Seedream 4.5 Pro - ByteDance ARK (legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
        provider: "azure-2",
        cost: [
            // Azure gpt-image-1-mini
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.0), // $2.00 per 1M text input tokens
                promptCachedTokens: perMillion(0.2), // $0.20 per 1M cached text input tokens
                promptImageTokens: perMillion(2.5), // $2.50 per 1M image input tokens
                completionImageTokens: perMillion(8), // $8.00 per 1M output tokens
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
        paidOnly: true,
        cost: [
            // Azure GPT Image 1.5 (via AI Foundry)
            // Official pricing: https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-openai%E2%80%99s-gpt-image-1-5-in-microsoft-foundry/4478139
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(8), // $8.00 per 1M input tokens (Azure)
                promptCachedTokens: perMillion(2), // $2.00 per 1M cached input tokens (Azure)
                promptImageTokens: perMillion(8), // $8.00 per 1M image input tokens (Azure)
                completionImageTokens: perMillion(32), // $32.00 per 1M output tokens (Azure)
            },
        ],
        description: "GPT Image 1.5 - OpenAI's advanced image generation model",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "flux": {
        aliases: [],
        modelId: "flux",
        provider: "vast.ai",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.001,
            },
        ],
        description: "Flux Schnell - Fast high-quality image generation",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "zimage": {
        aliases: ["z-image", "z-image-turbo"],
        modelId: "zimage",
        provider: "vast.ai",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.002,
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
        paidOnly: true,
        cost: [
            // Veo 3.1 Fast - $0.15 per second of video
            // We bill by "video seconds" - each second is counted like a token
            {
                date: COST_START_DATE,
                completionVideoSeconds: 0.15, // $0.15 per second of video
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
        paidOnly: true,
        cost: [
            // Seedance Lite - $1.8/M tokens
            // Token formula: (height × width × FPS × duration) / 1024
            {
                date: COST_START_DATE,
                completionVideoTokens: perMillion(1.8), // $1.8 per 1M tokens
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
        paidOnly: true,
        cost: [
            // Seedance Pro-Fast - $1/M tokens
            // Token formula: (height × width × FPS × duration) / 1024
            {
                date: COST_START_DATE,
                completionVideoTokens: perMillion(1.0), // $1.0 per 1M tokens
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
        paidOnly: true,
        cost: [
            // Wan 2.6 - Alibaba DashScope international pricing (720P)
            // T2V: $0.10/sec, I2V+audio: $0.05/sec, I2V no audio: $0.025/sec
            // Using I2V+audio rate as base since T2V also generates audio
            // Audio cost split out separately for tracking
            {
                date: new Date("2026-02-20").getTime(),
                completionVideoSeconds: 0.05, // $0.05 per second (video)
                completionAudioSeconds: 0.05, // $0.05 per second (audio)
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
        cost: [
            {
                date: new Date("2026-03-23").getTime(),
                completionVideoSeconds: 0.01, // $0.01/sec (video)
                completionAudioSeconds: 0.01, // $0.01/sec (audio)
            },
        ],
        description:
            "Wan 2.2 - Fast & cheap text/image-to-video (5s, 480P) via DashScope",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
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
        cost: [
            {
                date: new Date("2026-03-22").getTime(),
                completionImageTokens: 0.03, // $0.03 per image (international)
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
        cost: [
            {
                date: new Date("2026-03-22").getTime(),
                completionImageTokens: 0.02, // $0.02 per image
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
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-03-22").getTime(),
                completionImageTokens: 0.07, // $0.07 per image (pro)
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
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-03-22").getTime(),
                completionVideoSeconds: 0.07, // $0.07 per second at 720p
            },
        ],
        description:
            "Grok Video Pro - xAI official video generation (720p, 1-15s)",
        inputModalities: ["text"],
        outputModalities: ["video"],
    },
    "klein": {
        aliases: ["flux-klein"],
        modelId: "klein",
        provider: "bpai",
        alpha: true,
        cost: [
            {
                date: new Date("2026-01-21").getTime(), // Launch date
                completionImageTokens: 0.01,
            },
        ],
        description:
            "FLUX.2 Klein 4B - Fast image generation and editing via bpaigen",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "ltx-2": {
        aliases: ["ltx2", "ltxvideo", "ltx-video"],
        modelId: "ltx-2",
        provider: "vastai",
        cost: [
            {
                date: new Date("2026-03-23").getTime(),
                completionVideoSeconds: 0.01,
            },
        ],
        description: "LTX-2 - Fast text-to-video generation on Vast.ai",
        inputModalities: ["text"],
        outputModalities: ["video"],
    },
    "p-image": {
        aliases: ["pruna-image", "pruna"],
        modelId: "p-image",
        provider: "pruna",
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-03-13").getTime(),
                completionImageTokens: 0.005, // $0.005 per image
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
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-03-13").getTime(),
                completionImageTokens: 0.01, // $0.01 per image
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
        paidOnly: true,
        cost: [
            {
                date: new Date("2026-03-13").getTime(),
                completionVideoSeconds: 0.024, // $0.12 per run / 5s default = $0.024/sec
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
        paidOnly: true,
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.04, // $0.04 per image
            },
        ],
        description: "Amazon Nova Canvas - Bedrock Image Generation",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "nova-reel": {
        aliases: ["amazon-nova-reel"],
        modelId: "nova-reel",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                completionVideoSeconds: 0.08, // $0.08 per second of video
            },
        ],
        description:
            "Amazon Nova Reel - Bedrock Video Generation (6-30s, 720p)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
} as const satisfies Record<string, ServiceDefinition<string>>;
