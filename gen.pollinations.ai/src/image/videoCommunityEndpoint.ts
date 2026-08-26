import { Buffer } from "node:buffer";
import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointRuntime,
    communityEndpointErrorDetail,
    communityVideoGenerationsUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { HttpError } from "@shared/http-error.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import { detectVideoMimeType } from "@shared/video-mime.ts";
import type { VideoGenerationResult } from "./createAndReturnVideos.ts";
import type { ImageParams } from "./params.ts";
import { fetchUpstream } from "./utils/fetchUpstream.ts";
import { toDataUri } from "./utils/imageDownload.ts";

type CommunityVideoParams = Omit<ImageParams, "model"> & { model: string };

export async function callCommunityVideoEndpoint(
    endpoint: CommunityEndpointRuntime,
    prompt: string,
    safeParams: CommunityVideoParams,
    secret: string,
): Promise<VideoGenerationResult> {
    // Managed agents are text-only, so a video endpoint is always external.
    if (endpoint.kind !== "external") {
        throw new Error(
            `Community video endpoint '${endpoint.modelId}' is a managed agent`,
        );
    }
    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );

    // Build the request body for the OpenAI-compatible video generation
    // endpoint. Reference media (start/end frame images, reference video,
    // reference audio) is only forwarded when the endpoint declares the
    // corresponding input modality.
    const body: Record<string, unknown> = {
        model: endpoint.upstreamModel,
        prompt,
        ...(safeParams.duration !== undefined && {
            duration: safeParams.duration,
        }),
        ...(safeParams.aspectRatio !== undefined && {
            aspect_ratio: safeParams.aspectRatio,
        }),
        ...(safeParams.audio !== undefined && {
            generate_audio: safeParams.audio,
        }),
        ...(safeParams.seed !== undefined &&
            safeParams.seed !== -1 && { seed: safeParams.seed }),
    };

    const inputModalities = endpoint.inputModalities ?? [];
    if (inputModalities.includes("image") && safeParams.image?.length) {
        if (safeParams.image.length >= 1) {
            body.image = await toDataUri(safeParams.image[0]);
        }
        if (safeParams.image.length >= 2) {
            body.last_frame_image = await toDataUri(safeParams.image[1]);
        }
    }
    if (
        inputModalities.includes("video") &&
        safeParams.reference_video?.length
    ) {
        body.reference_video = safeParams.reference_video[0];
    }
    if (inputModalities.includes("audio") && safeParams.reference_audio) {
        body.reference_audio = safeParams.reference_audio;
    }

    const upstreamUrl = communityVideoGenerationsUrl(endpoint.baseUrl);
    const response = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${normalizeCommunityEndpointBearerToken(
                bearerToken,
            )}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        redirect: "manual",
        signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
    });

    const text = await response.text();

    if (!response.ok) {
        const parsed = parseJson(text);
        const message = communityEndpointErrorDetail(parsed);
        throw new HttpError(
            message
                ? `Community video endpoint responded ${response.status}: ${message}`
                : `Community video endpoint responded ${response.status}`,
            response.status,
            { body: text },
            upstreamUrl,
        );
    }

    const parsedBody = parseJson(text);
    const videoUrl = getFirstVideoUrl(parsedBody);
    if (!videoUrl) {
        throw new HttpError(
            "Community video endpoint did not return a playable video URL",
            502,
            { body: text },
            upstreamUrl,
        );
    }

    const videoResponse = await fetchUpstream(videoUrl, {
        errorLabel: "Failed to download community video output",
        signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
    });

    const buffer = Buffer.from(await videoResponse.arrayBuffer());
    if (buffer.length === 0) {
        throw new HttpError(
            "Community video endpoint returned an empty video",
            502,
        );
    }

    const mimeType =
        detectVideoMimeType(buffer) ??
        videoResponse.headers.get("content-type") ??
        "video/mp4";
    if (!mimeType.startsWith("video/")) {
        throw new HttpError(
            "Community video endpoint did not return a playable video",
            502,
        );
    }

    // Bill duration: prefer the upstream-reported duration, fall back to the
    // requested duration, then to 1 second.
    const durationSeconds =
        communityVideoSeconds(parsedBody) ?? safeParams.duration ?? 1;

    return {
        buffer,
        mimeType,
        durationSeconds,
        trackingData: {
            actualModel: endpoint.modelId,
            usage: {
                completionVideoSeconds: durationSeconds,
            },
        },
    };
}

function getFirstVideoUrl(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    const record = body as Record<string, unknown>;
    if (typeof record.url === "string" && record.url) return record.url;
    if (typeof record.video === "string" && record.video) return record.video;
    if (
        record.data &&
        Array.isArray(record.data) &&
        typeof record.data[0] === "object" &&
        record.data[0] !== null &&
        typeof (record.data[0] as { url?: unknown }).url === "string"
    ) {
        return (record.data[0] as { url: string }).url;
    }
    return null;
}

function communityVideoSeconds(body: unknown): number | null {
    if (!body || typeof body !== "object") return null;
    const record = body as Record<string, unknown>;
    if (typeof record.duration === "number") return record.duration;
    if (
        typeof record.usage === "object" &&
        record.usage !== null &&
        typeof (record.usage as { duration?: unknown }).duration === "number"
    ) {
        return (record.usage as { duration: number }).duration;
    }
    if (typeof record.video_seconds === "number") {
        return record.video_seconds as number;
    }
    return null;
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}
