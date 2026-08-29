import { Buffer } from "node:buffer";
import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointRuntime,
    communityEndpointErrorDetail,
    communityImageEditsUrl,
    communityImageGenerationsUrl,
    communityVideoGenerationsUrl,
    communityVideoSeconds,
    firstCommunityImageBytes,
    firstCommunityVideoBytes,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { HttpError } from "@shared/http-error.ts";
import {
    detectImageMimeType,
    detectVideoMimeType,
} from "@shared/image-mime.ts";
import type { Usage } from "@shared/registry/registry.ts";
import {
    getOpenAIImageUsage,
    openaiImageUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
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
    const body = await fetchCommunityJson(
        upstreamUrl,
        bearerToken,
        "image",
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

async function fetchCommunityJson(
    url: string,
    bearerToken: string,
    noun: string,
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
    }, noun);
    const text = await response.text();
    const parsed = parseJson(text);

    if (!response.ok) {
        throw new HttpError(
            endpointErrorMessage(response.status, parsed, noun),
            response.status,
            { body: text },
            url,
        );
    }
    return parsed;
}

async function fetchWithTimeout(
    input: string,
    init: RequestInit | undefined,
    noun: string,
): Promise<Response> {
    try {
        return await fetch(input, {
            ...init,
            redirect: "manual",
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        });
    } catch (error) {
        throw new HttpError(
            `Community ${noun} endpoint timed out or could not connect`,
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
    status: number,
    body: unknown,
    noun: string,
): string {
    const message = communityEndpointErrorDetail(body);
    return message
        ? `Community ${noun} endpoint responded ${status}: ${message}`
        : `Community ${noun} endpoint responded ${status}`;
}

export async function callCommunityVideoEndpoint(
    endpoint: CommunityEndpointRuntime,
    prompt: string,
    safeParams: Omit<ImageParams, "model"> & { model: string },
    secret: string,
): Promise<VideoGenerationResult> {
    // Managed agents are text-only, so a video endpoint is always external.
    if (endpoint.type !== "proxy") {
        throw new Error(
            `Community video endpoint '${endpoint.modelId}' is a managed agent`,
        );
    }
    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    const body = await fetchCommunityJson(
        communityVideoGenerationsUrl(endpoint.baseUrl),
        bearerToken,
        "video",
        JSON.stringify({
            model: endpoint.upstreamModel,
            prompt,
            // Forwarded in seconds when the caller asks for a length; the
            // upstream model owns everything else about the output.
            ...(safeParams.duration ? { duration: safeParams.duration } : {}),
        }),
    );

    const bytes = await firstCommunityVideoBytes(body, endpoint.baseUrl);
    if (!bytes) {
        throw new HttpError(
            "Community video endpoint returned no video data",
            502,
        );
    }
    const mimeType = detectVideoMimeType(bytes);
    if (!mimeType) {
        throw new HttpError(
            "Community video endpoint did not return a supported video format",
            502,
        );
    }
    // The duration is the meter, so an endpoint that does not report one is a
    // provider regression rather than a free request — the same stance the
    // transcription and token-priced image paths take. The registration probe
    // rejects endpoints that cannot report a duration, so reaching this means
    // an endpoint that could has stopped.
    const videoSeconds = communityVideoSeconds(body);
    if (videoSeconds === null) {
        throw new HttpError(
            "Community video endpoint did not report the video duration (expected usage.video_seconds or usage.duration) that video is billed on",
            502,
        );
    }
    return {
        buffer: Buffer.from(bytes),
        mimeType,
        durationSeconds: videoSeconds,
        trackingData: {
            actualModel: endpoint.upstreamModel,
            usage: { completionVideoSeconds: videoSeconds },
        },
    };
}
