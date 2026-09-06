import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import googleCloudAuth from "@/text/auth/googleCloudAuth.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { downloadUserImage } from "../utils/imageDownload.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

const logOps = debug("pollinations:gemini-omni:ops");

const MODEL_ID = "gemini-omni-1.1-flash-preview";
const PUBLIC_MODEL_ID = "google/gemini-omni-1.1-flash";
const RESOLUTIONS = ["360p", "720p", "1080p", "4k"] as const;

type ModalityTokens = {
    modality?: "text" | "image" | "audio" | "video" | "document";
    tokens?: number;
};

type GeminiOmniResponse = {
    status?: string;
    error?: {
        message?: string;
    };
    usage?: {
        input_tokens_by_modality?: ModalityTokens[];
        output_tokens_by_modality?: ModalityTokens[];
        total_thought_tokens?: number;
        total_tokens?: number;
    };
    steps?: Array<{
        content?: Array<{
            type?: string;
            data?: string;
            mime_type?: string;
        }>;
    }>;
};

function tokensFor(
    rows: ModalityTokens[] | undefined,
    modality: ModalityTokens["modality"],
): number | undefined {
    const total = rows
        ?.filter((row) => row.modality === modality)
        .reduce((sum, row) => sum + (row.tokens ?? 0), 0);
    return total && total > 0 ? total : undefined;
}

async function imageInput(url: string) {
    const { buffer, mimeType } = await downloadUserImage(url);
    return {
        type: "image" as const,
        data: buffer.toString("base64"),
        mime_type: mimeType,
    };
}

export async function callGeminiOmniAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const duration = safeParams.duration ?? 5;
    if (!Number.isInteger(duration) || duration < 3 || duration > 10) {
        throw UpstreamError.fromProvider(400, {
            message:
                "Gemini Omni 1.1 Flash supports whole-second durations from 3 to 10.",
        });
    }
    if (safeParams.fps !== undefined && safeParams.fps !== 24) {
        throw UpstreamError.fromProvider(400, {
            message: "Gemini Omni 1.1 Flash outputs video at 24 FPS.",
        });
    }

    const requestedResolution = safeParams.resolution ?? "720p";
    if (
        !RESOLUTIONS.includes(
            requestedResolution as (typeof RESOLUTIONS)[number],
        )
    ) {
        throw UpstreamError.fromProvider(400, {
            message: `Gemini Omni 1.1 Flash does not support ${requestedResolution} resolution.`,
        });
    }
    const resolution = requestedResolution as (typeof RESOLUTIONS)[number];
    const aspectRatio =
        safeParams.aspectRatio === "16:9" || safeParams.aspectRatio === "9:16"
            ? safeParams.aspectRatio
            : safeParams.dimensionsExplicit &&
                safeParams.height > safeParams.width
              ? "9:16"
              : "16:9";

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

    const input = [
        { type: "text" as const, text: prompt },
        ...(await Promise.all(safeParams.image.map(imageInput))),
    ];
    const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/interactions`;
    const response = await fetchUpstream(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: MODEL_ID,
            store: false,
            input,
            response_format: [
                {
                    type: "video",
                    aspect_ratio: aspectRatio,
                    resolution,
                    duration: `${duration}s`,
                },
            ],
            generation_config: {
                video_config: {
                    task:
                        safeParams.image.length > 0
                            ? "image_to_video"
                            : "text_to_video",
                },
            },
        }),
        errorLabel: "Gemini Omni API request failed",
    });
    const data = (await response.json()) as GeminiOmniResponse;
    const video = data.steps
        ?.flatMap((step) => step.content ?? [])
        .find((content) => content.type === "video" && content.data);
    if (data.status !== "completed" || !video?.data) {
        const detail =
            data.error?.message ?? `status: ${data.status ?? "unknown"}`;
        throw UpstreamError.fromProvider(502, {
            message: `Gemini Omni API returned no completed video (${detail})`,
            requestUrl: new URL(endpoint),
        });
    }

    const inputUsage = data.usage?.input_tokens_by_modality;
    const outputUsage = data.usage?.output_tokens_by_modality;
    const promptTextTokens = tokensFor(inputUsage, "text");
    const promptImageTokens = tokensFor(inputUsage, "image");
    const completionTextTokens = tokensFor(outputUsage, "text");
    const completionVideoTokens = tokensFor(outputUsage, "video");
    const completionReasoningTokens = data.usage?.total_thought_tokens;
    if (!completionVideoTokens) {
        throw UpstreamError.fromProvider(502, {
            message: "Gemini Omni API returned no billable video usage",
            requestUrl: new URL(endpoint),
        });
    }
    const usage = {
        ...(promptTextTokens ? { promptTextTokens } : {}),
        ...(promptImageTokens ? { promptImageTokens } : {}),
        ...(completionTextTokens ? { completionTextTokens } : {}),
        completionVideoTokens,
        ...(completionReasoningTokens ? { completionReasoningTokens } : {}),
        ...(data.usage?.total_tokens
            ? { totalTokenCount: data.usage.total_tokens }
            : {}),
    };

    logOps("Gemini Omni generation complete", {
        duration,
        resolution,
        aspectRatio,
        usage,
    });

    return {
        buffer: Buffer.from(video.data, "base64"),
        mimeType: video.mime_type ?? "video/mp4",
        durationSeconds: duration,
        trackingData: {
            actualModel: PUBLIC_MODEL_ID,
            usage,
        },
    };
}
