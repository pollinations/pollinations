import {
    communityChatCompletionsUrl,
    communityEmbeddingsUrl,
    communityImageGenerationsUrl,
    communityOpenAIBaseUrl,
    communitySpeechUrl,
    communityTranscriptionsUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { detectImageMimeType } from "@shared/image-mime.ts";
import type { Usage } from "@shared/registry/registry.ts";
import {
    getOpenAIEmbeddingUsage,
    getOpenAIImageUsage,
    getOpenAITranscriptionDuration,
    openaiImageUsageToUsage,
    openaiUsageToUsage,
} from "@shared/registry/usage-headers.ts";

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

function authorizationHeaders(bearerToken: string): HeadersInit {
    return {
        Authorization: `Bearer ${normalizeCommunityEndpointBearerToken(bearerToken)}`,
    };
}

function communityModelsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/models`;
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
    const response = await fetchEndpoint(url, init);
    return response.json().catch(() => null);
}

async function fetchEndpoint(
    url: string,
    init: RequestInit,
): Promise<Response> {
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

    if (!response.ok) {
        const body = await response
            .clone()
            .json()
            .catch(() => null);
        throw new Error(endpointErrorMessage(response.status, body));
    }
    return response;
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

    const imageBase64 = firstImageBase64(body);
    if (!imageBase64) {
        throw new Error("Endpoint did not return base64 OpenAI image data");
    }
    const imageBytes = decodeBase64(imageBase64);
    if (!imageBytes || !detectImageMimeType(imageBytes)) {
        throw new Error("Endpoint did not return a supported base64 image");
    }

    const usage = getOpenAIImageUsage(body);
    if (!usage) {
        throw new Error("Endpoint did not return OpenAI image token usage");
    }

    const billableUsage = openaiImageUsageToUsage(usage);
    if ((billableUsage.completionImageTokens ?? 0) <= 0) {
        throw new Error("Endpoint did not return billable image output tokens");
    }

    return {
        usage,
        billableUsage,
    };
}

export async function testCommunityEmbeddingEndpoint({
    baseUrl,
    bearerToken,
    model,
}: EndpointTestInput): Promise<CommunityEndpointTestResult> {
    const body = await fetchJson(communityEmbeddingsUrl(baseUrl), {
        method: "POST",
        headers: {
            ...authorizationHeaders(bearerToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            input: "A simple green sprout.",
            encoding_format: "float",
        }),
    });

    if (
        !body ||
        typeof body !== "object" ||
        !("data" in body) ||
        !Array.isArray(body.data) ||
        body.data.length !== 1 ||
        !body.data[0] ||
        typeof body.data[0] !== "object" ||
        !("embedding" in body.data[0]) ||
        !Array.isArray(body.data[0].embedding) ||
        body.data[0].embedding.length === 0 ||
        !body.data[0].embedding.every(
            (value: unknown) =>
                typeof value === "number" && Number.isFinite(value),
        )
    ) {
        throw new Error("Endpoint did not return OpenAI embedding data");
    }

    const usage = getOpenAIEmbeddingUsage(body);
    if (!usage || usage.prompt_tokens <= 0) {
        throw new Error("Endpoint did not return billable OpenAI token usage");
    }

    return {
        usage,
        billableUsage: { promptTextTokens: usage.prompt_tokens },
    };
}

export async function testCommunitySpeechEndpoint({
    baseUrl,
    bearerToken,
    model,
}: EndpointTestInput): Promise<CommunityEndpointTestResult> {
    const input = "A simple green sprout.";
    const response = await fetchEndpoint(communitySpeechUrl(baseUrl), {
        method: "POST",
        headers: {
            ...authorizationHeaders(bearerToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            input,
            voice: "alloy",
            response_format: "mp3",
        }),
    });
    const contentType = response.headers.get("content-type") || "";
    if (
        !isAudioContentType(contentType) ||
        (await response.arrayBuffer()).byteLength === 0
    ) {
        throw new Error("Endpoint did not return OpenAI speech audio");
    }

    return {
        usage: { characters: input.length },
        billableUsage: { completionAudioTokens: input.length },
    };
}

export async function testCommunityTranscriptionEndpoint({
    baseUrl,
    bearerToken,
    model,
}: EndpointTestInput): Promise<CommunityEndpointTestResult> {
    const form = new FormData();
    const wav = silentWav();
    form.append(
        "file",
        new File([wav.buffer as ArrayBuffer], "probe.wav", {
            type: "audio/wav",
        }),
    );
    form.append("model", model);
    form.append("response_format", "verbose_json");
    const body = await fetchJson(communityTranscriptionsUrl(baseUrl), {
        method: "POST",
        headers: authorizationHeaders(bearerToken),
        body: form,
    });
    const seconds = getOpenAITranscriptionDuration(body);
    if (
        !body ||
        typeof body !== "object" ||
        !("text" in body) ||
        typeof body.text !== "string" ||
        !seconds
    ) {
        throw new Error(
            "Endpoint did not return an OpenAI verbose transcription with duration",
        );
    }

    return {
        usage: { seconds },
        billableUsage: { promptAudioSeconds: seconds },
    };
}

function isAudioContentType(value: string): boolean {
    const mime = value.split(";", 1)[0]?.trim().toLowerCase();
    return mime?.startsWith("audio/") || mime === "application/octet-stream";
}

function silentWav(): Uint8Array {
    const sampleRate = 8_000;
    const dataLength = sampleRate * 2;
    const bytes = new Uint8Array(44 + dataLength);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, value: string) => {
        for (let index = 0; index < value.length; index++) {
            bytes[offset + index] = value.charCodeAt(index);
        }
    };
    text(0, "RIFF");
    view.setUint32(4, bytes.length - 8, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, dataLength, true);
    return bytes;
}

function firstImageBase64(body: unknown): string | null {
    if (
        !body ||
        typeof body !== "object" ||
        !("data" in body) ||
        !Array.isArray(body.data)
    ) {
        return null;
    }
    for (const image of body.data) {
        if (
            image &&
            typeof image === "object" &&
            "b64_json" in image &&
            typeof image.b64_json === "string" &&
            image.b64_json.length > 0
        ) {
            return image.b64_json;
        }
    }
    return null;
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
