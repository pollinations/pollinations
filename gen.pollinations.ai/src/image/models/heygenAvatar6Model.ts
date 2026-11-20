import { UpstreamError } from "@shared/error.ts";
import { FalError, runFalJobResponse } from "../../model3d/models/falClient.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { falBillableUnits, falUnitPrice } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { generateOpenRouterVideo } from "./openRouterVideoModel.ts";

const MODEL = "heygen/heygen-avatar-6";
const ENDPOINT = "heygen/avatar-6";
const RATES = { "1080p": 0.1, "2k": 0.145 } as const;

export function buildHeygenAvatarRequest(prompt: string, params: ImageParams) {
    const photo = params.image[0] ?? params.reference_images?.[0];
    const video = params.reference_videos?.[0];
    const audio = params.reference_audios?.[0];
    if (
        !audio ||
        (!photo && !video) ||
        params.image.length + (params.reference_images?.length ?? 0) > 1 ||
        (params.reference_videos?.length ?? 0) > 1 ||
        (params.reference_audios?.length ?? 0) !== 1 ||
        params.duration !== undefined
    ) {
        throw UpstreamError.fromProvider(400, {
            message:
                "Avatar 6 requires one audio URL and a photo or reference video; audio controls duration.",
        });
    }
    const resolution = params.resolution === "2k" ? "2k" : "1080p";
    return {
        endpoint: `${ENDPOINT}/${video ? "ref-video-to-video" : "image-to-video"}`,
        resolution,
        input: {
            resolution,
            audio_url: audio,
            enable_safety_checker: true,
            ...(prompt ? { motion_prompt: prompt } : {}),
            ...(photo ? { image_url: photo } : {}),
            ...(video ? { video_url: video } : {}),
        },
        openrouter: {
            model: MODEL,
            prompt,
            resolution,
            input_references: [
                ...(photo
                    ? [{ type: "image_url", image_url: { url: photo } }]
                    : []),
                ...(video
                    ? [{ type: "video_url", video_url: { url: video } }]
                    : []),
                { type: "audio_url", audio_url: { url: audio } },
            ],
            provider: { only: ["heygen"], allow_fallbacks: false },
        },
    };
}

export async function callHeygenAvatar6(
    prompt: string,
    params: ImageParams,
): Promise<VideoGenerationResult> {
    const request = buildHeygenAvatarRequest(prompt, params);
    const rate = RATES[request.resolution];
    if (params.model === `${MODEL}:openrouter`) {
        const { buffer, providerCost } = await generateOpenRouterVideo(
            request.openrouter,
            25 * 60 * 1000,
        );
        if (
            providerCost == null ||
            !Number.isFinite(providerCost) ||
            providerCost < 0
        ) {
            throw UpstreamError.fromProvider(502, {
                message:
                    "OpenRouter Avatar 6 cost receipt is missing or invalid",
            });
        }
        const seconds = providerCost / rate;
        return {
            buffer,
            mimeType: "video/mp4",
            durationSeconds: seconds,
            trackingData: {
                actualModel: params.model,
                usage: { completionVideoSeconds: seconds },
                providerBilling: { units: providerCost, unitCost: 1.055 },
            },
        };
    }
    const key = getImageEnv("FAL_KEY");
    if (!key)
        throw UpstreamError.fromProvider(500, {
            message: "FAL_KEY is not configured",
        });
    try {
        const unitCost = await falUnitPrice(request.endpoint, key);
        const response = await runFalJobResponse(
            { endpoint: request.endpoint, input: request.input },
            key,
        );
        const units = falBillableUnits(response);
        const payload = (await response.json()) as {
            video?: { url?: string; duration?: number; content_type?: string };
        };
        if (!payload.video?.url)
            throw UpstreamError.fromProvider(502, {
                message: "Fal Avatar 6 returned no video URL",
            });
        const downloaded = await fetchUpstream(payload.video.url, {
            errorLabel: "Fal Avatar 6 download failed",
        });
        const seconds =
            payload.video.duration &&
            Number.isFinite(payload.video.duration) &&
            payload.video.duration > 0
                ? payload.video.duration
                : (units * unitCost) / rate;
        return {
            buffer: Buffer.from(await downloaded.arrayBuffer()),
            mimeType:
                payload.video.content_type ||
                downloaded.headers.get("content-type") ||
                "video/mp4",
            durationSeconds: seconds,
            trackingData: {
                actualModel: params.model,
                usage: { completionVideoSeconds: seconds },
                providerBilling: { units, unitCost },
            },
        };
    } catch (error) {
        if (error instanceof UpstreamError) throw error;
        if (error instanceof FalError)
            throw UpstreamError.fromProvider(error.status ?? 502, {
                message: error.message,
                responseBody: error.responseBody,
            });
        throw UpstreamError.fromProvider(502, {
            message:
                error instanceof Error
                    ? error.message
                    : "Fal Avatar 6 request failed",
        });
    }
}
