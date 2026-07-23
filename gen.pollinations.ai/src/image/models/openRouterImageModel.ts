import type { Usage } from "@shared/registry/registry.ts";
import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { closestAspectRatio, closestByRatio } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { base64ToBuffer, toDataUri } from "../utils/imageDownload.ts";
import { writeExifMetadata } from "../writeExifMetadata.ts";

const logOps = debug("pollinations:openrouter-image:ops");
const logError = debug("pollinations:openrouter-image:error");

const OPENROUTER_IMAGE_URL = "https://openrouter.ai/api/v1/images";
const GROK_IMAGINE_QUALITY_MODEL = "x-ai/grok-imagine-image-quality";
type GeminiImageConfig = {
    upstreamModel: string;
    provider: string;
    maxReferenceImages: number;
    generator: string;
    resolution: "none" | "tiered" | "1K";
    reasoning: boolean;
};
const GEMINI_IMAGE_CONFIGS = {
    nanobanana: {
        upstreamModel: "google/gemini-2.5-flash-image",
        provider: "google-vertex/global",
        maxReferenceImages: 3,
        generator: "Vertex AI Gemini 2.5 Flash Image",
        resolution: "none",
        reasoning: false,
    },
    "nanobanana-2": {
        upstreamModel: "google/gemini-3.1-flash-image",
        provider: "google-vertex/global",
        maxReferenceImages: 14,
        generator: "Vertex AI Gemini 3.1 Flash Image",
        resolution: "tiered",
        reasoning: true,
    },
    "nanobanana-2-lite": {
        upstreamModel: "google/gemini-3.1-flash-lite-image",
        provider: "google-vertex/global",
        maxReferenceImages: 14,
        generator: "Vertex AI Gemini 3.1 Flash-Lite Image",
        resolution: "1K",
        reasoning: true,
    },
} as const satisfies Record<string, GeminiImageConfig>;
const GEMINI_ASPECT_RATIOS = [
    { ratio: 1, label: "1:1" },
    { ratio: 16 / 9, label: "16:9" },
    { ratio: 9 / 16, label: "9:16" },
    { ratio: 4 / 3, label: "4:3" },
    { ratio: 3 / 4, label: "3:4" },
    { ratio: 3 / 2, label: "3:2" },
    { ratio: 2 / 3, label: "2:3" },
    { ratio: 21 / 9, label: "21:9" },
    { ratio: 4 / 5, label: "4:5" },
    { ratio: 5 / 4, label: "5:4" },
] as const;

interface OpenRouterImageResponse {
    data?: Array<{ b64_json?: string; media_type?: string }>;
    usage?: OpenRouterImageUsage;
    error?:
        | string
        | {
              message?: string;
              type?: string;
              metadata?: { error_type?: string };
          };
    message?: string;
}

interface OpenRouterImageUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number | null;
    is_byok?: boolean;
    prompt_tokens_details?: {
        image_tokens?: number;
    };
    completion_tokens_details?: {
        reasoning_tokens?: number;
        image_tokens?: number;
    };
}

function isTokenCount(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0;
}

function invalidOpenRouterImageUsage(
    usage: OpenRouterImageUsage | undefined,
): never {
    logError(
        "OpenRouter returned invalid image billing usage:",
        JSON.stringify(usage),
    );
    throw new HttpError(
        "OpenRouter returned invalid image billing usage",
        502,
        usage,
        OPENROUTER_IMAGE_URL,
    );
}

function addUsage(usage: Usage, key: keyof Usage, amount: number) {
    if (amount > 0) usage[key] = amount;
}

function buildOpenRouterNoImageError(data: OpenRouterImageResponse): HttpError {
    const providerMessage =
        typeof data.error === "string"
            ? data.error
            : data.error?.message || data.message;
    const errorType =
        typeof data.error === "object"
            ? data.error.metadata?.error_type || data.error.type
            : undefined;
    const errorText = `${errorType ?? ""} ${providerMessage ?? ""}`;
    const isContentRejection =
        /content.?policy|prohibited|refusal|refused|safety/i.test(errorText);

    return new HttpError(
        providerMessage ||
            (isContentRejection
                ? "Image generation rejected by content policy"
                : "OpenRouter Gemini image API returned no image"),
        isContentRejection ? 400 : 502,
        data,
        OPENROUTER_IMAGE_URL,
    );
}

export function mapOpenRouterGeminiImageUsage(
    usage: OpenRouterImageUsage | undefined,
): Usage {
    if (
        !usage ||
        !isTokenCount(usage.prompt_tokens) ||
        !isTokenCount(usage.completion_tokens) ||
        !isTokenCount(usage.total_tokens) ||
        !isTokenCount(usage.completion_tokens_details?.image_tokens)
    ) {
        invalidOpenRouterImageUsage(usage);
    }

    const promptTokens = usage.prompt_tokens;
    const promptImageTokens = usage.prompt_tokens_details?.image_tokens ?? 0;
    if (!isTokenCount(promptImageTokens) || promptImageTokens > promptTokens) {
        invalidOpenRouterImageUsage(usage);
    }

    const completionTokens = usage.completion_tokens;
    const completionImageTokens = usage.completion_tokens_details.image_tokens;
    const completionReasoningTokens =
        usage.completion_tokens_details.reasoning_tokens ?? 0;
    const completionTextTokens =
        completionTokens - completionImageTokens - completionReasoningTokens;
    if (
        !isTokenCount(completionReasoningTokens) ||
        completionTextTokens < 0 ||
        usage.total_tokens !== promptTokens + completionTokens
    ) {
        invalidOpenRouterImageUsage(usage);
    }

    const mapped: Usage = {};
    addUsage(mapped, "promptImageTokens", promptImageTokens);
    // The dedicated OpenRouter image API currently returns combined
    // prompt_tokens without an input-image split. Gemini prices text and image
    // input identically, so assigning the unsplit remainder to text preserves
    // exact billing while retaining image tokens if OpenRouter adds the field.
    addUsage(mapped, "promptTextTokens", promptTokens - promptImageTokens);
    addUsage(mapped, "completionTextTokens", completionTextTokens);
    addUsage(mapped, "completionReasoningTokens", completionReasoningTokens);
    addUsage(mapped, "completionImageTokens", completionImageTokens);
    return mapped;
}

function resolveGeminiImageResolution(
    config: GeminiImageConfig,
    safeParams: ImageParams,
): "1K" | "2K" | "4K" | undefined {
    if (config.resolution === "none") return undefined;
    if (config.resolution === "1K") return "1K";

    const totalPixels = safeParams.width * safeParams.height;
    const tiers = [
        { name: "1K" as const, pixels: 1024 * 1024 },
        { name: "2K" as const, pixels: 1920 * 1080 },
        { name: "4K" as const, pixels: 3840 * 2160 },
    ];
    return tiers.reduce((closest, tier) =>
        Math.abs(tier.pixels - totalPixels) <
        Math.abs(closest.pixels - totalPixels)
            ? tier
            : closest,
    ).name;
}

function resolveGeminiReasoningEffort(
    config: GeminiImageConfig,
    safeParams: ImageParams,
): "low" | "high" | undefined {
    if (!config.reasoning || safeParams.reasoning === "balanced") {
        return undefined;
    }
    return safeParams.reasoning === "fast" ? "low" : "high";
}

export async function callOpenRouterGrokImagineProAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("OPENROUTER_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            "OPENROUTER_API_KEY environment variable is required",
            500,
        );
    }

    const referenceImage = safeParams.image?.[0];
    const requestBody: Record<string, unknown> = {
        model: GROK_IMAGINE_QUALITY_MODEL,
        prompt,
        n: 1,
        resolution: "1K",
    };

    const aspectRatio = closestAspectRatio(safeParams.width, safeParams.height);
    if (aspectRatio) requestBody.aspect_ratio = aspectRatio;

    if (referenceImage) {
        requestBody.input_references = [
            {
                type: "image_url",
                image_url: { url: referenceImage },
            },
        ];
    }

    const response = await fetchUpstream(OPENROUTER_IMAGE_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        errorLabel: "OpenRouter image generation request failed",
    });
    const data = (await response.json()) as OpenRouterImageResponse;
    const encodedImage = data.data?.[0]?.b64_json;
    if (!encodedImage) {
        throw new HttpError(
            "OpenRouter image API returned no image",
            502,
            data,
            OPENROUTER_IMAGE_URL,
        );
    }

    logOps("Grok Imagine Pro generation complete", {
        edit: Boolean(referenceImage),
        providerCost: data.usage?.cost,
    });

    return {
        buffer: base64ToBuffer(encodedImage),
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "grok-imagine-pro",
            usage: {
                ...(referenceImage ? { promptImageTokens: 1 } : {}),
                completionImageTokens: 1,
            },
        },
    };
}

export async function callOpenRouterGeminiImageAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const config =
        GEMINI_IMAGE_CONFIGS[
            safeParams.model as keyof typeof GEMINI_IMAGE_CONFIGS
        ];
    if (!config) {
        throw new HttpError(
            `Unsupported OpenRouter Gemini image model: ${safeParams.model}`,
            400,
        );
    }
    if (safeParams.image.length > config.maxReferenceImages) {
        throw new HttpError(
            `${safeParams.model} supports at most ${config.maxReferenceImages} reference images`,
            400,
        );
    }

    const apiKey = getImageEnv("OPENROUTER_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            "OPENROUTER_API_KEY environment variable is required",
            500,
        );
    }

    const requestBody: Record<string, unknown> = {
        model: config.upstreamModel,
        prompt,
        n: 1,
        aspect_ratio: closestByRatio(
            safeParams.width,
            safeParams.height,
            GEMINI_ASPECT_RATIOS,
        ).label,
        seed: safeParams.seed,
        provider: {
            only: [config.provider],
            allow_fallbacks: false,
        },
    };
    const resolution = resolveGeminiImageResolution(config, safeParams);
    if (resolution) requestBody.resolution = resolution;
    const reasoningEffort = resolveGeminiReasoningEffort(config, safeParams);
    if (reasoningEffort) requestBody.reasoning_effort = reasoningEffort;

    if (safeParams.image.length > 0) {
        const inputReferences = [];
        for (const image of safeParams.image) {
            inputReferences.push({
                type: "image_url",
                image_url: { url: await toDataUri(image) },
            });
        }
        requestBody.input_references = inputReferences;
    }

    const response = await fetchUpstream(OPENROUTER_IMAGE_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        errorLabel: "OpenRouter Gemini image generation request failed",
    });
    const data = (await response.json()) as OpenRouterImageResponse;
    const encodedImage = data.data?.[0]?.b64_json;
    if (!encodedImage) {
        throw buildOpenRouterNoImageError(data);
    }
    const usage = mapOpenRouterGeminiImageUsage(data.usage);
    const imageBuffer = base64ToBuffer(encodedImage);

    let finalImageBuffer = imageBuffer;
    try {
        finalImageBuffer = await writeExifMetadata(
            imageBuffer,
            {
                prompt,
                model: safeParams.model,
                width: safeParams.width,
                height: safeParams.height,
            },
            {
                generator: config.generator,
                usage,
            },
        );
    } catch (error) {
        logError("Failed to add Gemini image EXIF metadata:", error);
    }

    logOps("Gemini image generation complete", {
        actualModel: safeParams.model,
        referenceImages: safeParams.image.length,
        providerCost: data.usage?.cost,
    });

    return {
        buffer: finalImageBuffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: safeParams.model,
            usage,
        },
    };
}
