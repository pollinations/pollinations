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
        priceMultiplier: 1,
        cost: {
            completionImageTokens: 0.04, // per image
        },
        title: "FLUX.1 Kontext",
        description: "FLUX.1 Kontext - In-context editing & generation",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1, // Azure FLUX.1 Kontext edit route forwards one input image.
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
        title: "NanoBanana",
        description: "NanoBanana - Fast image generation & editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 3, // Pollinations cap for Gemini 2.5 Flash Image route.
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
        title: "NanoBanana 2",
        description:
            "NanoBanana 2 - Image generation & editing with sharper detail",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Pollinations cap for Gemini 3.1 Flash Image route.
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
        title: "NanoBanana Pro",
        description: "NanoBanana Pro - Gemini 3 Pro Image (4K, Thinking)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Gemini 3 Pro Image provider limit.
    },
    "seedream5": {
        aliases: [],
        modelId: "seedream5",
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
            "Seedream 5.0 Lite - Image generation with web search & reasoning",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Pollinations route cap from Replicate schema.
    },
    "seedream": {
        aliases: [],
        modelId: "seedream",
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
        description: "Seedream 4.0 - Photorealistic image generation",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10, // Pollinations route cap from Replicate schema.
    },
    "seedream-pro": {
        aliases: [],
        modelId: "seedream-pro",
        provider: "replicate",
        brand: "ByteDance",
        category: "image",
        addedDate: new Date("2025-12-04").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.04, // per image
        },
        title: "Seedream 4.5 Pro",
        description:
            "Seedream 4.5 Pro - Premium photorealistic image generation",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 14, // Pollinations route cap from Replicate schema.
    },
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
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
        description: "GPT Image 1 Mini - Fast & affordable image generation",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16, // GPT Image edit endpoint accepts up to 16 input images.
    },
    "gptimage-large": {
        aliases: ["gpt-image-1.5", "gpt-image-large"],
        modelId: "gptimage-large",
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
        description: "GPT Image 1.5 - High-fidelity image generation & editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16, // GPT Image edit endpoint accepts up to 16 input images.
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
        title: "GPT Image 2",
        description:
            "GPT Image 2 - Premium high-resolution image generation & editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 16, // GPT Image edit endpoint accepts up to 16 input images.
    },
    "flux": {
        aliases: [],
        modelId: "flux",
        provider: "fireworks",
        brand: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2025-10-07").getTime(),
        priceMultiplier: 1.25,
        cost: {
            completionImageTokens: 0.0014, // per image
        },
        title: "Flux Schnell",
        description:
            "Flux Schnell - Fast high-quality image generation (Fireworks)",
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
        priceMultiplier: 1,
        cost: {
            completionImageTokens: 0.002, // per image
        },
        title: "Z-Image Turbo",
        description: "Z-Image Turbo - Alibaba S3-DiT 6B with 2x SPAN upscaling",
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
        title: "Veo 3.1 Fast",
        description: "Veo 3.1 Fast - Fast text-to-video with audio (preview)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
    },
    "seedance-pro": {
        aliases: [],
        modelId: "seedance-pro",
        provider: "replicate",
        brand: "ByteDance",
        category: "video",
        addedDate: new Date("2025-12-04").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // Replicate bytedance/seedance-1-pro-fast is per-second tiered by
        // resolution (480p $0.015, 720p $0.025, 1080p $0.06). Handler is locked
        // to 720p; revisit if/when the registry supports tiered pricing.
        cost: {
            completionVideoSeconds: 0.025, // per sec at 720p
        },
        title: "Seedance Pro-Fast",
        description:
            "Seedance Pro-Fast - Text/image-to-video (720p, better prompt adherence)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "seedance-2.0": {
        aliases: ["seedance-2"],
        modelId: "seedance-2.0",
        provider: "replicate",
        brand: "ByteDance",
        category: "video",
        addedDate: new Date("2026-05-07").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // non_video_in tier @ 720p; see provider-billing/providers/replicate.md
        cost: {
            completionVideoSeconds: 0.18,
        },
        title: "Seedance 2.0",
        description:
            "Seedance 2.0 - ByteDance multimodal video gen (720p, native audio)",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "end_frame", "audio_output"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
    },
    "wan": {
        aliases: ["wan2.6", "wan-i2v"],
        modelId: "wan",
        provider: "alibaba",
        brand: "Alibaba",
        category: "video",
        addedDate: new Date("2026-01-21").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // Using I2V+audio rate as base since T2V also generates audio; audio cost split out separately for tracking
            completionVideoSeconds: 0.05, // per sec
            completionAudioSeconds: 0.05, // per sec
        },
        title: "Wan 2.6",
        description:
            "Wan 2.6 - Alibaba text/image-to-video with audio (2-15s, up to 1080P)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "audio_output"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "wan-fast": {
        aliases: ["wan2.2", "wan-2.2"],
        modelId: "wan-fast",
        provider: "alibaba",
        brand: "Alibaba",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.01, // per sec
            completionAudioSeconds: 0.01, // per sec
        },
        title: "Wan 2.2",
        description: "Wan 2.2 - Fast & cheap text/image-to-video (5s, 480P)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame", "end_frame"],
        maxReferenceImages: 2, // Video keyframe slots: start + end.
    },
    "wan-pro": {
        aliases: ["wan2.7", "wan-2.7"],
        modelId: "wan-pro",
        provider: "alibaba",
        brand: "Alibaba",
        category: "video",
        addedDate: new Date("2026-05-26").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        // DashScope `wan2.7-i2v` / `wan2.7-t2v` bill bundled video+audio at
        // $0.10/s (720P) or $0.15/s (1080P). Handler currently locked to 720P
        // (see prepareVideoParameters); revisit if registry supports tiered
        // pricing. Audio bundled into the video duration per upstream invoice.
        cost: {
            completionVideoSeconds: 0.1, // per sec (720P, includes audio)
        },
        title: "Wan 2.7",
        description:
            "Wan 2.7 - Alibaba text/image-to-video with bundled audio (720P / 1080P)",
        inputModalities: ["text", "image"],
        outputModalities: ["video", "audio"],
        videoCapabilities: ["start_frame", "audio_output"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "wan-image": {
        aliases: ["wan2.7-image", "wan-img"],
        modelId: "wan-image",
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
            "Wan 2.7 Image - Alibaba text-to-image and image editing (up to 2K)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 9, // Pollinations route cap.
    },
    "wan-image-pro": {
        aliases: ["wan2.7-image-pro", "wan-img-pro"],
        modelId: "wan-image-pro",
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
            "Wan 2.7 Image Pro - Alibaba text-to-image and editing (4K, thinking mode)",
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
        modelId: "qwen-image",
        provider: "replicate",
        brand: "Qwen",
        category: "image",
        addedDate: new Date("2026-03-23").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // Moved off Alibaba DashScope to Replicate: qwen/qwen-image (t2i,
        // $0.025) + qwen/qwen-image-edit-plus (edit, $0.03). Billed at $0.03.
        cost: {
            completionImageTokens: 0.03, // per image
        },
        title: "Qwen Image Plus",
        description:
            "Qwen Image Plus - Alibaba text-to-image and image editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 3, // DashScope Qwen Image Edit route cap.
    },
    "grok-imagine": {
        aliases: ["grok-imagine-image"],
        modelId: "grok-imagine",
        provider: "xai",
        brand: "xAI",
        category: "image",
        addedDate: new Date("2026-02-25").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.02, // per image
        },
        title: "Grok Imagine",
        description: "Grok Imagine - Photorealistic image generation",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1, // xAI image edit route forwards one input image.
    },
    "grok-imagine-pro": {
        aliases: ["grok-aurora", "aurora", "grok-imagine-image-pro"],
        modelId: "grok-imagine-pro",
        provider: "xai",
        brand: "xAI",
        category: "image",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.07, // per image
        },
        title: "Grok Imagine Pro",
        description:
            "Grok Imagine Pro - xAI official pro image generation (Aurora)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1, // xAI image edit route forwards one input image.
    },
    "grok-video-pro": {
        aliases: ["grok-imagine-video"],
        modelId: "grok-video-pro",
        provider: "xai",
        brand: "xAI",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.05, // per sec at 720p
        },
        title: "Grok Video Pro",
        description:
            "Grok Video Pro - xAI official video generation (720p, 1-15s)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "klein": {
        aliases: ["flux-klein"],
        modelId: "klein",
        provider: "runpod",
        brand: "Black Forest Labs",
        category: "image",
        addedDate: new Date("2026-01-17").getTime(),
        priceMultiplier: 1,
        alpha: true,
        cost: {
            completionImageTokens: 0.01,
        },
        title: "FLUX.2 Klein 4B",
        description: "FLUX.2 Klein 4B - Fast image generation and editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 10, // Pollinations self-hosted route cap.
    },
    "ltx-2": {
        aliases: ["ltx2", "ltx-2.3", "ltxvideo", "ltx-video"],
        modelId: "ltx-2",
        provider: "lambda",
        brand: "Lightricks",
        category: "video",
        addedDate: new Date("2026-02-06").getTime(),
        priceMultiplier: 1,
        alpha: true,
        cost: {
            completionVideoSeconds: 0.005,
        },
        title: "LTX-2.3",
        description:
            "LTX-2.3 - Fast text/image-to-video generation with upscaler",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "p-image": {
        aliases: ["pruna-image", "pruna"],
        modelId: "p-image",
        provider: "replicate",
        brand: "Pruna",
        category: "image",
        addedDate: new Date("2026-03-14").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.005, // per image
        },
        title: "Pruna p-image",
        description: "Pruna p-image - Fast text-to-image generation",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "p-image-edit": {
        aliases: ["pruna-edit", "pruna-image-edit"],
        modelId: "p-image-edit",
        provider: "replicate",
        brand: "Pruna",
        category: "image",
        addedDate: new Date("2026-03-14").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.01, // per image
        },
        title: "Pruna p-image-edit",
        description: "Pruna p-image-edit - Image-to-image editing",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 5, // Pollinations route cap.
    },
    // Pruna p-video is one Replicate model (prunaai/p-video) priced per second
    // by resolution: 720p $0.02/s, 1080p $0.04/s. The registry carries one flat
    // rate per model, so we expose the two tiers as separate models, each with
    // its real per-second cost. `p-video` aliases to the 720p tier.
    "p-video-720p": {
        aliases: ["p-video", "pruna-video"],
        modelId: "p-video-720p",
        provider: "replicate",
        brand: "Pruna",
        category: "video",
        addedDate: new Date("2026-03-14").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.02, // Replicate 720p per sec
        },
        title: "Pruna p-video 720p",
        description: "Pruna p-video - Text/image-to-video generation (720p)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "p-video-1080p": {
        aliases: ["pruna-video-1080p"],
        modelId: "p-video-1080p",
        provider: "replicate",
        brand: "Pruna",
        category: "video",
        addedDate: new Date("2026-06-09").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            completionVideoSeconds: 0.04, // Replicate 1080p per sec
        },
        title: "Pruna p-video 1080p",
        description: "Pruna p-video - Text/image-to-video generation (1080p)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
    "nova-canvas": {
        aliases: ["amazon-nova-canvas"],
        modelId: "nova-canvas",
        provider: "aws",
        brand: "Amazon",
        category: "image",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        cost: {
            completionImageTokens: 0.04, // per image
        },
        title: "Nova Canvas",
        description: "Nova Canvas - Image generation, editing & inpainting",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        maxReferenceImages: 1, // Nova Canvas route forwards one input image.
    },
    "nova-reel": {
        aliases: ["amazon-nova-reel"],
        modelId: "nova-reel",
        provider: "aws",
        brand: "Amazon",
        category: "video",
        addedDate: new Date("2026-03-23").getTime(),
        priceMultiplier: 1,
        cost: {
            completionVideoSeconds: 0.08, // per sec
        },
        title: "Nova Reel",
        description: "Nova Reel - Video Generation (6-120s, 720p)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        videoCapabilities: ["start_frame"],
        maxReferenceImages: 1, // Video keyframe slots: start only.
    },
} as const satisfies Record<string, ModelDefinition<string>>;

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
