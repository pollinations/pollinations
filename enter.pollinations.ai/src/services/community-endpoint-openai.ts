import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointImagePricing,
    communityAudioTranscriptionsUrl,
    communityChatCompletionsUrl,
    communityEmbeddingsUrl,
    communityEndpointErrorDetail,
    communityImageEditsUrl,
    communityImageGenerationsUrl,
    communityOpenAIBaseUrl,
    communityTranscriptionSeconds,
    decodeCommunityBase64,
    firstCommunityImageBytes,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { detectImageMimeType } from "@shared/image-mime.ts";
import type { ModelInputModality, Usage } from "@shared/registry/registry.ts";
import {
    getOpenAIEmbeddingUsage,
    getOpenAIImageUsage,
    openaiImageUsageToUsage,
    openaiUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import { SAMPLE_AUDIO_BASE64 } from "./sample-audio.ts";

type EndpointAuth = {
    baseUrl: string;
    bearerToken: string;
};

type EndpointTestInput = EndpointAuth & { model: string };

export type CommunityEndpointUsage = Record<string, unknown>;

export type CommunityEndpointTestResult = {
    usage: CommunityEndpointUsage;
    billableUsage: Usage;
    /** Image tests only: billing mode detected from the probe response. */
    imagePricing?: CommunityEndpointImagePricing;
    /** Image tests only: input types detected by the generation/edit probes. */
    inputModalities?: ModelInputModality[];
};

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
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
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
    const message = communityEndpointErrorDetail(body);
    const prefix =
        status === 401
            ? "Endpoint responded 401 after we sent Authorization"
            : status >= 300 && status < 400
              ? `Endpoint responded ${status} with a redirect, which is not supported`
              : `Endpoint responded ${status}`;
    return message ? `${prefix}: ${message}` : prefix;
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

    const imageBytes = await firstCommunityImageBytes(body, baseUrl);
    const imageMimeType = imageBytes && detectImageMimeType(imageBytes);
    if (!imageBytes || !imageMimeType) {
        throw new Error("Endpoint did not return a supported image");
    }
    const supportsImageInput = await testCommunityImageEdits(
        { baseUrl, bearerToken, model },
        imageBytes,
        imageMimeType,
    );
    const inputModalities: ModelInputModality[] = supportsImageInput
        ? ["text", "image"]
        : ["text"];

    // Endpoints that return valid OpenAI image token usage are billed
    // per token ("tokens"); everything else falls back to a fixed price
    // per generated image ("request").
    const openaiUsage = getOpenAIImageUsage(body);
    if (openaiUsage && openaiUsage.output_tokens > 0) {
        return {
            usage: { ...openaiUsage },
            billableUsage: openaiImageUsageToUsage(openaiUsage),
            imagePricing: "tokens",
            inputModalities,
        };
    }
    return {
        usage: { images: 1 },
        billableUsage: { completionImageTokens: 1 },
        imagePricing: "request",
        inputModalities,
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
    if (usage && usage.prompt_tokens > 0) {
        return {
            usage,
            billableUsage: { promptTextTokens: usage.prompt_tokens },
        };
    }
    if (
        !usage &&
        body &&
        typeof body === "object" &&
        "usage" in body &&
        body.usage !== undefined &&
        body.usage !== null
    ) {
        throw new Error("Endpoint did not return billable OpenAI token usage");
    }

    return {
        usage: { requests: 1 },
        billableUsage: { completionTextTokens: 1 },
    };
}

// Transcription endpoints are billed against prompt audio seconds, mirroring
// the first-party whisper/scribe models. The probe uploads a real audio file
// and validates the OpenAI transcription response shape.
export async function testCommunityTranscriptionEndpoint({
    baseUrl,
    bearerToken,
    model,
}: EndpointTestInput): Promise<CommunityEndpointTestResult> {
    const sampleBytes = decodeCommunityBase64(SAMPLE_AUDIO_BASE64);
    if (!sampleBytes) {
        throw new Error("Failed to decode sample audio");
    }
    const formData = new FormData();
    formData.append("model", model);
    // Same format the request path pins, so what the probe proves is what
    // callers actually get. See callCommunityTranscriptionEndpoint.
    formData.append("response_format", "verbose_json");
    formData.append(
        "file",
        new Blob([new Uint8Array(sampleBytes)], { type: "audio/wav" }),
        "sample.wav",
    );

    let body: unknown;
    try {
        body = await fetchJson(communityAudioTranscriptionsUrl(baseUrl), {
            method: "POST",
            headers: authorizationHeaders(bearerToken),
            body: formData,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // A plain-json-only endpoint rejects verbose_json outright. Name the
        // requirement rather than leaving the owner staring at a bare 400.
        throw new Error(
            message.includes("responded 400")
                ? `${message}. Pollinations requests response_format=verbose_json because that is where the audio duration transcription is billed on is reported; models that only support plain json cannot be registered yet.`
                : message,
        );
    }

    // The sample is real speech, so a working endpoint returns something. We
    // never check what — the wording varies by model and language.
    if (
        !body ||
        typeof body !== "object" ||
        !("text" in body) ||
        typeof body.text !== "string" ||
        body.text.trim().length === 0
    ) {
        throw new Error("Endpoint did not return OpenAI transcription text");
    }

    // The duration is what the endpoint is billed on, so one that cannot report
    // it must not register — otherwise every request through it would be
    // unbillable and the owner would earn nothing.
    const promptAudioSeconds = communityTranscriptionSeconds(body);
    if (promptAudioSeconds === null) {
        throw new Error(
            "Endpoint did not report the audio duration (expected verbose_json's top-level duration, or usage.seconds), which is required to bill transcription",
        );
    }

    return {
        // The pricing UI marks the prompt-audio row against a usage key named
        // in that field's rawUsagePaths, and the duration is the only thing
        // billed here — so report it directly rather than echoing an upstream
        // usage object that may not carry it.
        usage: { duration: promptAudioSeconds },
        billableUsage: { promptAudioSeconds },
    };
}

async function testCommunityImageEdits(
    { baseUrl, bearerToken, model }: EndpointTestInput,
    imageBytes: Uint8Array,
    imageMimeType: string,
): Promise<boolean> {
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", "Add a small blue dot to the image.");
    formData.append("n", "1");
    formData.append("size", "1024x1024");
    formData.append("quality", "medium");
    formData.append(
        "image",
        new Blob([new Uint8Array(imageBytes)], { type: imageMimeType }),
        `source.${imageMimeType.split("/")[1] ?? "png"}`,
    );

    try {
        const body = await fetchJson(communityImageEditsUrl(baseUrl), {
            method: "POST",
            headers: authorizationHeaders(bearerToken),
            body: formData,
        });
        const editedImage = await firstCommunityImageBytes(body, baseUrl);
        return Boolean(editedImage && detectImageMimeType(editedImage));
    } catch {
        return false;
    }
}
