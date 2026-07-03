import {
    type CommunityEndpointRuntime,
    communityImageGenerationsUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { ImageGenerationResult } from "./createAndReturnImages.ts";
import { HttpError } from "./httpError.ts";
import type { ImageParams } from "./params.ts";

type CommunityImageParams = Omit<ImageParams, "model"> & { model: string };

const REQUEST_TIMEOUT_MS = 120_000;

export async function callCommunityImageEndpoint(
    endpoint: CommunityEndpointRuntime,
    prompt: string,
    safeParams: CommunityImageParams,
    secret: string,
): Promise<ImageGenerationResult> {
    if (safeParams.image.length > 0) {
        throw new HttpError(
            "Community image endpoints currently support text-to-image generation only",
            400,
            { validation: true },
        );
    }

    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    const upstreamUrl = communityImageGenerationsUrl(endpoint.baseUrl);
    const body = await fetchCommunityImageJson(upstreamUrl, bearerToken, {
        model: endpoint.upstreamModel,
        prompt,
        n: 1,
        size: `${safeParams.width}x${safeParams.height}`,
        quality: safeParams.quality === "hd" ? "high" : safeParams.quality,
        ...(safeParams.transparent
            ? { background: "transparent", output_format: "png" }
            : {}),
    });

    const image = firstImage(body);
    const buffer =
        typeof image.b64_json === "string"
            ? Buffer.from(image.b64_json, "base64")
            : await fetchCommunityImageUrl(image.url);

    return {
        buffer,
        isMature: false,
        isChild: false,
        trackingData: {
            usage: { completionImageTokens: 1 },
        },
    };
}

async function fetchCommunityImageJson(
    url: string,
    bearerToken: string,
    body: Record<string, unknown>,
): Promise<unknown> {
    const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${normalizeCommunityEndpointBearerToken(
                bearerToken,
            )}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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

async function fetchCommunityImageUrl(
    url: string | undefined,
): Promise<Buffer> {
    if (!url) {
        throw new HttpError(
            "Community image endpoint returned no image data",
            502,
        );
    }
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
        throw new HttpError(
            `Community image URL fetch failed with ${response.status}`,
            response.status,
            { body: await response.text().catch(() => "") },
            url,
        );
    }
    return Buffer.from(await response.arrayBuffer());
}

async function fetchWithTimeout(
    input: string,
    init?: RequestInit,
): Promise<Response> {
    try {
        return await fetch(input, {
            ...init,
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

function firstImage(body: unknown): { b64_json?: string; url?: string } {
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
        if ("b64_json" in image && typeof image.b64_json === "string") {
            return { b64_json: image.b64_json };
        }
        if ("url" in image && typeof image.url === "string") {
            return { url: image.url };
        }
    }
    throw new HttpError(
        "Community image endpoint did not return an image URL or base64 data",
        502,
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
