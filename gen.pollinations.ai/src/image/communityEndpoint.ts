import { Buffer } from "node:buffer";
import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointRuntime,
    communityEndpointErrorDetail,
    communityImageEditsUrl,
    communityImageGenerationsUrl,
    communityVideoGenerationsUrl,
    firstCommunityImageBytes,
    firstCommunityVideoData,
    MAX_COMMUNITY_MEDIA_RESPONSE_BYTES,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { HttpError } from "@shared/http-error.ts";
import { detectImageMimeType } from "@shared/image-mime.ts";
import type { Usage } from "@shared/registry/registry.ts";
import {
    getOpenAIImageUsage,
    openaiImageUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import { readResponseText } from "@shared/response-bytes.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import { detectVideoMimeType } from "@shared/video-mime.ts";
import type { ImageGenerationResult } from "./createAndReturnImages.ts";
import type { VideoGenerationResult } from "./createAndReturnVideos.ts";
import type { ImageParams } from "./params.ts";
import {
    bufferToUint8Array,
    downloadUserImage,
} from "./utils/imageDownload.ts";

type CommunityImageParams = Omit<ImageParams, "model"> & { model: string };

export async function callCommunityImageEndpoint(
    endpoint: CommunityEndpointRuntime,
    prompt: string,
    safeParams: CommunityImageParams,
    secret: string,
): Promise<ImageGenerationResult> {
    // Managed agents are text-only, so an image endpoint is always external.
    if (endpoint.type !== "proxy") {
        throw new Error(
            `Community image endpoint '${endpoint.modelId}' is a managed agent`,
        );
    }
    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    const isEdit = safeParams.image.length > 0;
    const upstreamUrl = isEdit
        ? communityImageEditsUrl(endpoint.baseUrl)
        : communityImageGenerationsUrl(endpoint.baseUrl);
    const body = await fetchCommunityMediaJson(
        upstreamUrl,
        bearerToken,
        isEdit
            ? await imageEditFormData(endpoint, prompt, safeParams)
            : JSON.stringify({
                  model: endpoint.upstreamModel,
                  prompt,
                  n: 1,
                  size: `${safeParams.width}x${safeParams.height}`,
                  quality:
                      safeParams.quality === "hd" ? "high" : safeParams.quality,
                  ...(safeParams.transparent
                      ? { background: "transparent", output_format: "png" }
                      : {}),
              }),
        "image",
    );

    const bytes = await firstCommunityImageBytes(body, endpoint.baseUrl);
    if (!bytes || !detectImageMimeType(bytes)) {
        throw new HttpError(
            "Community image endpoint did not return a supported image",
            502,
        );
    }
    return {
        buffer: Buffer.from(bytes),
        isMature: false,
        isChild: false,
        trackingData: {
            usage: communityImageUsage(endpoint, body),
        },
    };
}

type CommunityVideoParams = {
    model: string;
    duration?: number;
};

export async function callCommunityVideoEndpoint(
    endpoint: CommunityEndpointRuntime,
    prompt: string,
    safeParams: CommunityVideoParams,
    secret: string,
): Promise<VideoGenerationResult> {
    if (endpoint.type !== "proxy") {
        throw new Error(
            `Community video endpoint '${endpoint.modelId}' is a managed agent`,
        );
    }
    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    const body = await fetchCommunityMediaJson(
        communityVideoGenerationsUrl(endpoint.baseUrl),
        bearerToken,
        JSON.stringify({
            model: endpoint.upstreamModel,
            prompt,
            ...(safeParams.duration !== undefined
                ? { duration: safeParams.duration }
                : {}),
        }),
        "video",
    );
    const video = await firstCommunityVideoData(
        body,
        endpoint.baseUrl,
        safeParams.duration,
    );
    const mimeType = video && detectVideoMimeType(video.bytes);
    if (!video || !mimeType) {
        throw new HttpError(
            "Community video endpoint did not return a supported video with duration_seconds",
            502,
        );
    }
    return {
        buffer: Buffer.from(video.bytes),
        mimeType,
        durationSeconds: video.durationSeconds,
        trackingData: {
            actualModel: endpoint.modelId,
            usage: { completionVideoSeconds: video.durationSeconds },
        },
    };
}

async function imageEditFormData(
    endpoint: CommunityEndpointRuntime,
    prompt: string,
    safeParams: CommunityImageParams,
): Promise<FormData> {
    const formData = new FormData();
    formData.append("model", endpoint.upstreamModel);
    formData.append("prompt", prompt);
    formData.append("n", "1");
    formData.append("size", `${safeParams.width}x${safeParams.height}`);
    formData.append(
        "quality",
        safeParams.quality === "hd" ? "high" : safeParams.quality,
    );
    if (safeParams.transparent) {
        formData.append("background", "transparent");
        formData.append("output_format", "png");
    }

    const imageField = safeParams.image.length === 1 ? "image" : "image[]";
    for (const [index, imageUrl] of safeParams.image.entries()) {
        const { buffer, mimeType } = await downloadUserImage(
            imageUrl,
            AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        );
        const extension = mimeType.split("/")[1];
        formData.append(
            imageField,
            new Blob([bufferToUint8Array(buffer)], { type: mimeType }),
            `image-${index + 1}.${extension}`,
        );
    }
    return formData;
}

// "tokens" endpoints registered with per-1M prices must keep returning the
// OpenAI image usage they were probed with — billing the owner-declared token
// rates against a made-up count would misprice the request, so a missing or
// empty usage block is a provider regression and fails the request. "request"
// endpoints always bill exactly one image at the fixed price.
function communityImageUsage(
    endpoint: CommunityEndpointRuntime,
    body: unknown,
): Usage {
    if (endpoint.imagePricing !== "tokens") {
        return { completionImageTokens: 1 };
    }
    const openaiUsage = getOpenAIImageUsage(body);
    if (!openaiUsage) {
        throw new HttpError(
            "Community image endpoint did not return OpenAI image token usage",
            502,
        );
    }
    const usage = openaiImageUsageToUsage(openaiUsage);
    if ((usage.completionImageTokens ?? 0) <= 0) {
        throw new HttpError(
            "Community image endpoint did not return billable image output tokens",
            502,
        );
    }
    return usage;
}

async function fetchCommunityMediaJson(
    url: string,
    bearerToken: string,
    body: string | FormData,
    modality: "image" | "video",
): Promise<unknown> {
    const response = await fetchWithTimeout(url, modality, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${normalizeCommunityEndpointBearerToken(
                bearerToken,
            )}`,
            ...(typeof body === "string"
                ? { "Content-Type": "application/json" }
                : {}),
        },
        body,
    });
    const text = await readResponseText(
        response,
        MAX_COMMUNITY_MEDIA_RESPONSE_BYTES,
        () => new HttpError("Community endpoint response is too large", 502),
    );
    const parsed = parseJson(text);

    if (!response.ok) {
        throw new HttpError(
            endpointErrorMessage(modality, response.status, parsed),
            response.status,
            { body: text },
            url,
        );
    }
    return parsed;
}

async function fetchWithTimeout(
    input: string,
    modality: "image" | "video",
    init?: RequestInit,
): Promise<Response> {
    try {
        return await fetch(input, {
            ...init,
            redirect: "manual",
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        });
    } catch (error) {
        throw new HttpError(
            `Community ${modality} endpoint timed out or could not connect`,
            502,
            { error: error instanceof Error ? error.message : String(error) },
            input,
        );
    }
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function endpointErrorMessage(
    modality: "image" | "video",
    status: number,
    body: unknown,
): string {
    const message = communityEndpointErrorDetail(body);
    return message
        ? `Community ${modality} endpoint responded ${status}: ${message}`
        : `Community ${modality} endpoint responded ${status}`;
}
