import {
    communityChatCompletionsUrl,
    communityImageGenerationsUrl,
    communityOpenAIBaseUrl,
    normalizeCommunityAssetUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { detectImageMimeType } from "@shared/image-mime.ts";
import type { Usage } from "@shared/registry/registry.ts";
import { openaiUsageToUsage } from "@shared/registry/usage-headers.ts";

type EndpointAuth = {
    baseUrl: string;
    bearerToken: string;
};

type EndpointTestInput = EndpointAuth & { model: string };

export type CommunityEndpointUsage = Record<string, unknown>;

export type CommunityEndpointTestResult = {
    usage: CommunityEndpointUsage;
    billableUsage: Usage;
};

const REQUEST_TIMEOUT_MS = 90_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function authorizationHeaders(bearerToken: string): HeadersInit {
    return {
        Authorization: `Bearer ${normalizeCommunityEndpointBearerToken(bearerToken)}`,
    };
}

function communityModelsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/models`;
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
        // The base URL is validated against https + the private-host blocklist
        // before we fetch; following redirects would let the endpoint bounce
        // the probe to an unvalidated destination.
        response = await fetch(url, {
            ...init,
            redirect: "manual",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new Error("Endpoint request timed out or could not connect");
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(endpointErrorMessage(response.status, body));
    }
    return body;
}

function endpointErrorMessage(status: number, body: unknown): string {
    const message = endpointBodyMessage(body);
    const prefix =
        status === 401
            ? "Endpoint responded 401 after we sent Authorization"
            : status >= 300 && status < 400
              ? `Endpoint responded ${status} with a redirect, which is not supported`
              : `Endpoint responded ${status}`;
    return message ? `${prefix}: ${message}` : prefix;
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

export async function listCommunityEndpointModels({
    baseUrl,
    bearerToken,
}: EndpointAuth): Promise<string[]> {
    const body = await fetchJson(communityModelsUrl(baseUrl), {
        headers: authorizationHeaders(bearerToken),
    });
    const models =
        body &&
        typeof body === "object" &&
        "data" in body &&
        Array.isArray(body.data)
            ? body.data
                  .map((model) =>
                      model &&
                      typeof model === "object" &&
                      "id" in model &&
                      typeof model.id === "string"
                          ? model.id
                          : null,
                  )
                  .filter((id): id is string => Boolean(id))
            : [];
    if (models.length === 0) {
        throw new Error("Endpoint did not return any OpenAI models");
    }
    return Array.from(new Set(models)).sort();
}

export async function testCommunityEndpoint({
    baseUrl,
    bearerToken,
    model,
}: EndpointTestInput): Promise<CommunityEndpointTestResult> {
    const body = await fetchJson(communityChatCompletionsUrl(baseUrl), {
        method: "POST",
        headers: {
            ...authorizationHeaders(bearerToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Reply with OK." }],
            stream: false,
        }),
    });

    if (
        !body ||
        typeof body !== "object" ||
        !("choices" in body) ||
        !Array.isArray(body.choices)
    ) {
        throw new Error("Endpoint did not return OpenAI chat choices");
    }
    if (
        !("usage" in body) ||
        !body.usage ||
        typeof body.usage !== "object" ||
        !("prompt_tokens" in body.usage) ||
        !("completion_tokens" in body.usage) ||
        !("total_tokens" in body.usage) ||
        typeof body.usage.prompt_tokens !== "number" ||
        typeof body.usage.completion_tokens !== "number" ||
        typeof body.usage.total_tokens !== "number"
    ) {
        throw new Error("Endpoint did not return OpenAI token usage");
    }
    const usage = body.usage as CommunityEndpointUsage;
    return {
        usage,
        billableUsage: openaiUsageToUsage(
            usage as Parameters<typeof openaiUsageToUsage>[0],
        ),
    };
}

export async function testCommunityImageEndpoint({
    baseUrl,
    bearerToken,
    model,
}: EndpointTestInput): Promise<CommunityEndpointTestResult> {
    const body = await fetchJson(communityImageGenerationsUrl(baseUrl), {
        method: "POST",
        headers: {
            ...authorizationHeaders(bearerToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            prompt: "A simple green sprout icon on a white background.",
            n: 1,
            size: "1024x1024",
            quality: "medium",
        }),
    });

    const imageBytes = await firstImageBytes(body, baseUrl);
    if (!imageBytes || !detectImageMimeType(imageBytes)) {
        throw new Error("Endpoint did not return a supported image");
    }

    return {
        usage: { images: 1 },
        billableUsage: { completionImageTokens: 1 },
    };
}

async function firstImageBytes(
    body: unknown,
    endpointBaseUrl: string,
): Promise<Uint8Array | null> {
    if (
        !body ||
        typeof body !== "object" ||
        !("data" in body) ||
        !Array.isArray(body.data)
    ) {
        return null;
    }
    for (const image of body.data) {
        if (!image || typeof image !== "object") continue;
        if (
            "b64_json" in image &&
            typeof image.b64_json === "string" &&
            image.b64_json.length > 0
        ) {
            return decodeBase64(image.b64_json);
        }
        if (
            "url" in image &&
            typeof image.url === "string" &&
            image.url.length > 0
        ) {
            return fetchImageBytes(image.url, endpointBaseUrl);
        }
    }
    return null;
}

async function fetchImageBytes(
    value: string,
    endpointBaseUrl: string,
): Promise<Uint8Array> {
    let url: string;
    try {
        url = normalizeCommunityAssetUrl(value, endpointBaseUrl);
    } catch {
        throw new Error("Endpoint returned an unsafe image URL");
    }
    let response: Response;
    try {
        response = await fetch(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new Error("Endpoint image URL timed out or could not connect");
    }
    if (!response.ok) {
        throw new Error(`Endpoint image URL responded ${response.status}`);
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        throw new Error("Endpoint image is larger than 20 MB");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
        throw new Error("Endpoint image is larger than 20 MB");
    }
    return bytes;
}

function decodeBase64(value: string): Uint8Array | null {
    try {
        const encoded = value
            .replace(/^data:[^,]+,/, "")
            .replace(/\s/g, "")
            .replace(/-/g, "+")
            .replace(/_/g, "/");
        const decoded = atob(encoded);
        return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    } catch {
        return null;
    }
}
