import { Buffer } from "node:buffer";
import {
    type CommunityEndpointRuntime,
    communityImageEditsUrl,
    communityImageGenerationsUrl,
    normalizeCommunityAssetUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { detectImageMimeType } from "@shared/image-mime.ts";
import type { Usage } from "@shared/registry/registry.ts";
import {
    getOpenAIImageUsage,
    openaiImageUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { ImageGenerationResult } from "./createAndReturnImages.ts";
import { HttpError } from "./httpError.ts";
import type { ImageParams } from "./params.ts";
import {
    base64ToBuffer,
    bufferToUint8Array,
    downloadUserImage,
} from "./utils/imageDownload.ts";

type CommunityImageParams = Omit<ImageParams, "model"> & { model: string };

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export async function callCommunityImageEndpoint(
    endpoint: CommunityEndpointRuntime,
    prompt: string,
    safeParams: CommunityImageParams,
    secret: string,
): Promise<ImageGenerationResult> {
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

    const buffer = await firstImageBuffer(body, endpoint.baseUrl);
    if (!detectImageMimeType(buffer)) {
        throw new HttpError(
            "Community image endpoint did not return a supported image",
            502,
        );
    }
    return {
        buffer,
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
            AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

async function firstImageBuffer(
    body: unknown,
    endpointBaseUrl: string,
): Promise<Buffer> {
    if (
        !body ||
        typeof body !== "object" ||
        !("data" in body) ||
        !Array.isArray(body.data)
    ) {
        throw new HttpError(
            "Community image endpoint did not return OpenAI image data",
            502,
        );
    }
    for (const image of body.data) {
        if (!image || typeof image !== "object") continue;
        if (
            "b64_json" in image &&
            typeof image.b64_json === "string" &&
            image.b64_json.length > 0
        ) {
            return base64ToBuffer(image.b64_json);
        }
        if (
            "url" in image &&
            typeof image.url === "string" &&
            image.url.length > 0
        ) {
            return fetchImageBuffer(image.url, endpointBaseUrl);
        }
    }
    throw new HttpError(
        "Community image endpoint did not return base64 or URL image data",
        502,
    );
}

async function fetchImageBuffer(
    value: string,
    endpointBaseUrl: string,
): Promise<Buffer> {
    let url: string;
    try {
        url = normalizeCommunityAssetUrl(value, endpointBaseUrl);
    } catch {
        throw new HttpError(
            "Community image endpoint returned an unsafe image URL",
            502,
        );
    }
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
        throw new HttpError(
            `Community image URL responded ${response.status}`,
            502,
            undefined,
            url,
        );
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        throw new HttpError("Community image is larger than 20 MB", 502);
    }
    return readImageBuffer(response);
}

async function readImageBuffer(response: Response): Promise<Buffer> {
    const reader = response.body?.getReader();
    if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
            throw new HttpError("Community image is larger than 20 MB", 502);
        }
        return buffer;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_IMAGE_BYTES) {
                await reader.cancel();
                throw new HttpError(
                    "Community image is larger than 20 MB",
                    502,
                );
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    return Buffer.concat(
        chunks.map((chunk) => Buffer.from(chunk)),
        total,
    );
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function endpointErrorMessage(status: number, body: unknown): string {
    const message = endpointBodyMessage(body);
    return message
        ? `Community image endpoint responded ${status}: ${message}`
        : `Community image endpoint responded ${status}`;
}

function endpointBodyMessage(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    if (
        "error" in body &&
        body.error &&
        typeof body.error === "object" &&
        "message" in body.error &&
        typeof body.error.message === "string"
    ) {
        return body.error.message;
    }
    if ("error" in body && typeof body.error === "string") return body.error;
    if ("message" in body && typeof body.message === "string") {
        return body.message;
    }
    return null;
}
