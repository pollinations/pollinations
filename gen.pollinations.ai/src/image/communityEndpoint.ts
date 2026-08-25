import { Buffer } from "node:buffer";
import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointRuntime,
    communityEndpointErrorDetail,
    communityImageEditsUrl,
    communityImageGenerationsUrl,
    communityVideoGenerationsUrl,
    firstCommunityImageBytes,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { HttpError } from "@shared/http-error.ts";
import { detectImageMimeType } from "@shared/image-mime.ts";
import type { Usage } from "@shared/registry/registry.ts";
import {
    getOpenAIImageUsage,
    openaiImageUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { ImageGenerationResult } from "./createAndReturnImages.ts";
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
    const body = await fetchCommunityImageJson(
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

async function fetchCommunityImageJson(
    url: string,
    bearerToken: string,
    body: string | FormData,
): Promise<unknown> {
    const response = await fetchWithTimeout(url, {
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
    const text = await response.text();
    const parsed = parseJson(text);

    if (!response.ok) {
        throw new HttpError(
            endpointErrorMessage(response.status, parsed),
            response.status,
            { body: text },
            url,
        );
    }
    return parsed;
}

async function fetchWithTimeout(
    input: string,
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
            "Community image endpoint timed out or could not connect",
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

function endpointErrorMessage(status: number, body: unknown): string {
    const message = communityEndpointErrorDetail(body);
    return message
        ? `Community image endpoint responded ${status}: ${message}`
        : `Community image endpoint responded ${status}`;
}

export type CommunityVideoOptions = {
    prompt: string;
    model?: string;
    duration?: number;
    resolution?: string;
    aspectRatio?: string;
};

export async function callCommunityVideoEndpoint(
    endpoint: CommunityEndpointRuntime,
    prompt: string,
    safeParams: {
        model?: string;
        duration?: number;
        resolution?: string;
        aspectRatio?: string;
    },
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
    const upstreamUrl = communityVideoGenerationsUrl(endpoint.baseUrl);

    const body = JSON.stringify({
        model: endpoint.upstreamModel,
        prompt,
        ...(safeParams.duration ? { duration: safeParams.duration } : {}),
        ...(safeParams.resolution ? { resolution: safeParams.resolution } : {}),
        ...(safeParams.aspectRatio
            ? { aspect_ratio: safeParams.aspectRatio }
            : {}),
    });

    let response: Response;
    try {
        response = await fetch(upstreamUrl, {
            method: "POST",
            headers: {
                ...authorizationHeaders(bearerToken),
                "Content-Type": "application/json",
            },
            body,
            redirect: "manual",
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        });
    } catch {
        throw new Error(
            "Community video endpoint timed out or could not connect",
        );
    }

    if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(endpointErrorMessage(response.status, errBody));
    }

    const result = await response.json();
    const videoData = result.data?.[0];
    const videoUrl = videoData?.url ?? videoData?.b64_json;

    if (!videoUrl) {
        throw new HttpError(
            "Community video endpoint did not return video data",
            502,
        );
    }

    let videoBuffer: Buffer;
    let durationSeconds = safeParams.duration ?? 4;

    if (videoUrl.startsWith("http")) {
        const videoResponse = await fetch(videoUrl, {
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        });
        if (!videoResponse.ok) {
            throw new Error("Failed to download video from community endpoint");
        }
        videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    } else {
        videoBuffer = Buffer.from(videoUrl, "base64");
    }

    if (videoData?.duration) {
        durationSeconds = videoData.duration;
    }

    return {
        buffer: videoBuffer,
        mimeType: "video/mp4",
        durationSeconds,
        trackingData: {
            actualModel: endpoint.modelId,
            usage: {
                completionVideoSeconds: durationSeconds,
            },
        },
    };
}
