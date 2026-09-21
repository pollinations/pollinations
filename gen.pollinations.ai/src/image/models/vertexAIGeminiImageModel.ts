import { UpstreamError } from "@shared/error.ts";
import type { Usage } from "@shared/registry/registry.ts";
import debug from "debug";
import googleCloudAuth from "@/text/auth/googleCloudAuth.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { closestByRatio } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { base64ToBuffer, downloadUserImage } from "../utils/imageDownload.ts";
import { writeExifMetadata } from "../writeExifMetadata.ts";

const log = debug("pollinations:vertex-gemini-image:ops");
const logError = debug("pollinations:vertex-gemini-image:error");

const VERTEX_ASPECT_RATIOS = [
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

type VertexGeminiImageConfig = {
    model: string;
    generator: string;
    maxReferenceImages: number;
    resolution: "none" | "tiered" | "1K";
    reasoning: boolean;
};

const VERTEX_GEMINI_IMAGE_CONFIGS = {
    "google/gemini-2.5-flash-image": {
        model: "gemini-2.5-flash-image",
        generator: "Vertex AI Gemini 2.5 Flash Image",
        maxReferenceImages: 3,
        resolution: "none",
        reasoning: false,
    },
    "google/gemini-3.1-flash-image": {
        model: "gemini-3.1-flash-image",
        generator: "Vertex AI Gemini 3.1 Flash Image",
        maxReferenceImages: 14,
        resolution: "tiered",
        reasoning: true,
    },
    "google/gemini-3.1-flash-lite-image": {
        model: "gemini-3.1-flash-lite-image",
        generator: "Vertex AI Gemini 3.1 Flash-Lite Image",
        maxReferenceImages: 14,
        resolution: "1K",
        reasoning: true,
    },
    "google/gemini-3-pro-image": {
        model: "gemini-3-pro-image",
        generator: "Vertex AI Gemini 3 Pro Image",
        maxReferenceImages: 14,
        resolution: "tiered",
        reasoning: false,
    },
} as const satisfies Record<string, VertexGeminiImageConfig>;

type VertexModality = "TEXT" | "IMAGE" | "AUDIO" | "VIDEO";

export type VertexGeminiImageUsage = {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
    promptTokensDetails?: Array<{
        modality?: VertexModality;
        tokenCount?: number;
    }>;
    candidatesTokensDetails?: Array<{
        modality?: VertexModality;
        tokenCount?: number;
    }>;
};

type VertexResponse = {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
                inlineData?: { mimeType?: string; data?: string };
            }>;
        };
        finishReason?: string;
        safetyRatings?: Array<{
            blocked?: boolean;
            category?: string;
            probability?: string;
        }>;
    }>;
    usageMetadata?: VertexGeminiImageUsage;
};

const PROMPT_USAGE_KEYS: Partial<Record<VertexModality, keyof Usage>> = {
    TEXT: "promptTextTokens",
    IMAGE: "promptImageTokens",
};

const COMPLETION_USAGE_KEYS: Partial<Record<VertexModality, keyof Usage>> = {
    TEXT: "completionTextTokens",
    IMAGE: "completionImageTokens",
};

function isTokenCount(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0;
}

function invalidVertexUsage(usage: VertexGeminiImageUsage | undefined): never {
    logError("Vertex returned invalid image billing usage", usage);
    throw UpstreamError.fromProvider(502, {
        message: "Vertex AI returned invalid image billing usage metadata",
        responseBody: JSON.stringify(usage),
    });
}

function addUsage(usage: Usage, key: keyof Usage, amount: number) {
    if (amount > 0) usage[key] = (usage[key] ?? 0) + amount;
}

function mapModalityDetails(
    mapped: Usage,
    details: NonNullable<VertexGeminiImageUsage["promptTokensDetails"]>,
    keys: Partial<Record<VertexModality, keyof Usage>>,
    providerUsage: VertexGeminiImageUsage,
): number {
    let total = 0;
    for (const detail of details) {
        const key = detail.modality && keys[detail.modality];
        if (!key || !isTokenCount(detail.tokenCount)) {
            invalidVertexUsage(providerUsage);
        }
        addUsage(mapped, key, detail.tokenCount);
        total += detail.tokenCount;
    }
    return total;
}

export function mapVertexGeminiImageUsage(
    usage: VertexGeminiImageUsage | undefined,
): Usage {
    if (
        !usage ||
        !isTokenCount(usage.promptTokenCount) ||
        !isTokenCount(usage.candidatesTokenCount) ||
        !isTokenCount(usage.totalTokenCount) ||
        (usage.thoughtsTokenCount !== undefined &&
            !isTokenCount(usage.thoughtsTokenCount)) ||
        !usage.promptTokensDetails?.length ||
        !usage.candidatesTokensDetails?.length
    ) {
        invalidVertexUsage(usage);
    }

    const mapped: Usage = {};
    const promptTokens = mapModalityDetails(
        mapped,
        usage.promptTokensDetails,
        PROMPT_USAGE_KEYS,
        usage,
    );
    const candidateTokens = mapModalityDetails(
        mapped,
        usage.candidatesTokensDetails,
        COMPLETION_USAGE_KEYS,
        usage,
    );
    const thoughtsTokens = usage.thoughtsTokenCount ?? 0;
    addUsage(mapped, "completionReasoningTokens", thoughtsTokens);

    if (
        promptTokens !== usage.promptTokenCount ||
        candidateTokens !== usage.candidatesTokenCount ||
        !mapped.completionImageTokens ||
        promptTokens + candidateTokens + thoughtsTokens !==
            usage.totalTokenCount
    ) {
        invalidVertexUsage(usage);
    }

    return mapped;
}

function imageSize(
    config: VertexGeminiImageConfig,
    params: ImageParams,
): "1K" | "2K" | "4K" | undefined {
    if (config.resolution === "none") return undefined;
    if (config.resolution === "1K") return "1K";
    const pixels = params.width * params.height;
    const tiers = [
        { name: "1K" as const, pixels: 1024 * 1024 },
        { name: "2K" as const, pixels: 1920 * 1080 },
        { name: "4K" as const, pixels: 3840 * 2160 },
    ];
    return tiers.reduce((closest, tier) =>
        Math.abs(tier.pixels - pixels) < Math.abs(closest.pixels - pixels)
            ? tier
            : closest,
    ).name;
}

function noImageError(response: VertexResponse): UpstreamError {
    const candidate = response.candidates?.[0];
    const explanation = candidate?.content?.parts
        ?.map((part) => part.text)
        .filter((text): text is string => Boolean(text))
        .join("\n");
    const blocked = candidate?.safetyRatings
        ?.filter((rating) => rating.blocked)
        .map((rating) => rating.category)
        .filter(Boolean)
        .join(", ");
    return UpstreamError.fromProvider(400, {
        message:
            explanation ||
            blocked ||
            candidate?.finishReason ||
            "Vertex AI returned no image",
        responseBody: JSON.stringify(response),
        errorCode: "content_policy_violation",
    });
}

export async function callVertexAIGeminiImageAPI(
    prompt: string,
    params: ImageParams,
): Promise<ImageGenerationResult> {
    const config =
        VERTEX_GEMINI_IMAGE_CONFIGS[
            params.model as keyof typeof VERTEX_GEMINI_IMAGE_CONFIGS
        ];
    if (!config) {
        throw UpstreamError.fromProvider(400, {
            message: `Unsupported Vertex Gemini image model: ${params.model}`,
        });
    }
    if (params.image.length > config.maxReferenceImages) {
        throw UpstreamError.fromProvider(400, {
            message: `${params.model} supports at most ${config.maxReferenceImages} reference images`,
        });
    }

    const projectId = getImageEnv("GOOGLE_PROJECT_ID");
    if (!projectId) {
        throw UpstreamError.fromProvider(500, {
            message: "GOOGLE_PROJECT_ID environment variable is required",
        });
    }
    const accessToken = await googleCloudAuth.getAccessToken();
    if (!accessToken) {
        throw UpstreamError.fromProvider(500, {
            message: "Failed to get Google Cloud access token",
        });
    }

    const parts: Array<{
        text?: string;
        inlineData?: { mimeType: string; data: string };
    }> = [{ text: prompt }];
    for (const image of params.image) {
        const downloaded = await downloadUserImage(image);
        parts.push({
            inlineData: {
                mimeType: downloaded.mimeType,
                data: downloaded.buffer.toString("base64"),
            },
        });
    }

    const resolvedImageSize = imageSize(config, params);
    const thinkingConfig =
        config.reasoning && params.reasoning !== "balanced"
            ? {
                  thinkingConfig: {
                      thinkingLevel:
                          params.reasoning === "fast" ? "MINIMAL" : "HIGH",
                  },
              }
            : {};
    const requestBody = {
        contents: [{ role: "user", parts }],
        generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 2048,
            seed: params.seed,
            imageConfig: {
                aspectRatio: closestByRatio(
                    params.width,
                    params.height,
                    VERTEX_ASPECT_RATIOS,
                ).label,
                ...(resolvedImageSize && { imageSize: resolvedImageSize }),
            },
            ...thinkingConfig,
        },
        safetySettings: [
            "HARM_CATEGORY_HATE_SPEECH",
            "HARM_CATEGORY_DANGEROUS_CONTENT",
            "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            "HARM_CATEGORY_HARASSMENT",
        ].map((category) => ({
            category,
            threshold: params.safe
                ? "BLOCK_MEDIUM_AND_ABOVE"
                : "BLOCK_ONLY_HIGH",
        })),
    };

    const endpoint = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${config.model}:generateContent`;
    const response = await fetchUpstream(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        errorLabel: "Vertex Gemini image generation request failed",
    });
    const data = (await response.json()) as VertexResponse;
    const candidate = data.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find(
        (part) => part.inlineData?.data,
    )?.inlineData;
    if (!imagePart?.data) throw noImageError(data);

    const usage = mapVertexGeminiImageUsage(data.usageMetadata);
    const imageBuffer = base64ToBuffer(imagePart.data);
    let finalImageBuffer = imageBuffer;
    try {
        finalImageBuffer = await writeExifMetadata(
            imageBuffer,
            {
                prompt,
                model: params.model,
                width: params.width,
                height: params.height,
            },
            { generator: config.generator, usage: data.usageMetadata },
        );
    } catch (error) {
        logError("Failed to add Vertex Gemini image EXIF metadata", error);
    }

    log("Vertex Gemini image generation complete", {
        actualModel: params.model,
        referenceImages: params.image.length,
    });
    return {
        buffer: finalImageBuffer,
        isMature: false,
        isChild: false,
        trackingData: { actualModel: params.model, usage },
    };
}
