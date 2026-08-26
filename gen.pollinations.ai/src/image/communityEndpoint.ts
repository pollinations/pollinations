import { Buffer } from "node:buffer";
import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointRuntime,
    communityEndpointErrorDetail,
    communityImageEditsUrl,
    communityImageGenerationsUrl,
    communityVideoUrl,
    firstCommunityImageBytes,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { HttpError } from "@shared/http-error.ts";
import { detectImageMimeType, detectVideoMimeType } from "@shared/image-mime.ts";
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

export async function callCommunityVideoEndpoint(
    endpoint: CommunityEndpointRuntime,
    prompt: string,
    safeParams: Omit<ImageParams, "model"> & { model: string },
    secret: string,
): Promise<import("./createAndReturnVideos.ts").VideoGenerationResult> {
    if (endpoint.type !== "proxy") {
        throw new Error(
            `Community video endpoint '${endpoint.modelId}' is a managed agent`,
        );
    }
    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    const upstreamUrl = communityVideoUrl(endpoint.baseUrl);
    const body = await fetchCommunityVideoJson(
        upstreamUrl,
        bearerToken,
        JSON.stringify({
            model: endpoint.upstreamModel,
            prompt,
            duration: safeParams.duration ?? 5,
            width: safeParams.width ?? 1280,
            height: safeParams.height ?? 720,
            ...(safeParams.image?.length > 0
                ? { image: safeParams.image[0] }
                : {}),
        }),
    );
    const bytes = await firstCommunityVideoBytes(body, endpoint.baseUrl);
    const mimeType = bytes ? detectVideoMimeType(bytes) : null;
    if (!bytes || !mimeType) {
        throw new HttpError(
            "Community video endpoint did not return a supported video",
            502,
        );
    }
    const durationSeconds = communityVideoDuration(body);
    return {
        buffer: Buffer.from(bytes),
        mimeType,
        durationSeconds: durationSeconds || safeParams.duration || 5,
        trackingData: {
            actualModel: endpoint.upstreamModel || "community",
            usage: {
                completionVideoSeconds: durationSeconds || safeParams.duration || 5,
            },
        },
    };
}

async function fetchCommunityVideoJson(
    url: string,
    bearerToken: string,
    body: string,
): Promise<unknown> {
    const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${normalizeCommunityEndpointBearerToken(bearerToken)}`,
            "Content-Type": "application/json",
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

export async function firstCommunityVideoBytes(
    body: unknown,
    endpointBaseUrl: string,
): Promise<Uint8Array | null> {
    if (!body || typeof body !== "object") return null;
    const record = body as Record<string, unknown>;
    // Try base64 video data first (OpenAI-compatible format)
    if ("data" in record && Array.isArray(record.data)) {
        for (const item of record.data) {
            if (!item || typeof item !== "object") continue;
            if ("b64_json" in item && typeof (item as Record<string, unknown>).b64_json === "string") {
                const decoded = decodeCommunityBase64((item as Record<string, unknown>).b64_json as string);
                if (decoded && detectedVideoMime(decoded)) return decoded;
            }
            if ("url" in item && typeof (item as Record<string, unknown>).url === "string") {
                const url = (item as Record<string, unknown>).url as string;
                try {
                    const response = await fetch(url, {
                        redirect: "manual",
                        signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
                    });
                    if (response.ok) {
                        const buffer = new Uint8Array(await response.arrayBuffer());
                        if (detectedVideoMime(buffer)) return buffer;
                    }
                } catch {
                    // ignore network errors, continue trying other items
                }
            }
        }
    }
    // Fall back to inline base64 video directly
    if ("b64_json" in record && typeof record.b64_json === "string") {
        const decoded = decodeCommunityBase64(record.b64_json);
        if (decoded && detectedVideoMime(decoded)) return decoded;
    }
    // Try url field at top level
    if ("url" in record && typeof record.url === "string") {
        try {
            const response = await fetch(record.url as string, {
                redirect: "manual",
                signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
            });
            if (response.ok) {
                const buffer = new Uint8Array(await response.arrayBuffer());
                if (detectedVideoMime(buffer)) return buffer;
            }
        } catch {
            // ignore
        }
    }
    return null;
}

function detectedVideoMime(bytes: Uint8Array): boolean {
    return detectVideoMimeType(bytes) !== null;
}

export function communityVideoDuration(body: unknown): number | null {
    if (!body || typeof body !== "object") return null;
    const record = body as Record<string, unknown>;
    // OpenAI-compatible usage shape: usage.video_seconds or usage.duration
    const usage = record.usage && typeof record.usage === "object"
        ? (record.usage as Record<string, unknown>)
        : undefined;
    for (const value of [usage?.video_seconds, usage?.duration, record.duration]) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return null;
}

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
