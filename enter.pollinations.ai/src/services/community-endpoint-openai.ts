import {
    communityAudioSpeechUrl,
    communityAudioTranscriptionsUrl,
    communityEmbeddingsUrl,
    communityImageEditsUrl,
    communityImageGenerationsUrl,
    communityOpenAIBaseUrl,
} from "@shared/community-endpoint-urls.ts";
import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointApi,
    type CommunityEndpointImagePricing,
    communityEndpointErrorDetail,
    communityTranscriptionSeconds,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import {
    decodeCommunityBase64,
    firstCommunityImageBytes,
    firstCommunityVideoBytes,
    MAX_COMMUNITY_MEDIA_RESPONSE_BYTES,
} from "@shared/community-media.ts";
import { detectImageMimeType } from "@shared/image-mime.ts";
import type { ModelInputModality, Usage } from "@shared/registry/registry.ts";
import {
    getOpenAIEmbeddingUsage,
    getOpenAIImageUsage,
    openaiImageUsageToUsage,
    openaiUsageToUsage,
    responsesUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import { readResponseBytes, readResponseText } from "@shared/response-bytes.ts";
import {
    CompletionUsageSchema,
    CreateResponseResponseSchema,
    ResponseTerminalEventSchema,
} from "@shared/schemas/openai.ts";
import { detectVideoMimeType } from "@shared/video-mime.ts";
import { createParser } from "eventsource-parser";
import { z } from "zod";
import { SAMPLE_AUDIO_BASE64 } from "./sample-audio.ts";

type EndpointAuth = {
    baseUrl: string;
    bearerToken: string;
};

type ModelEndpointTestInput = EndpointAuth & { model: string };

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
    const url = new URL(communityOpenAIBaseUrl(baseUrl));
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/models`;
    return url.toString();
}

async function fetchText(
    url: string,
    init: RequestInit,
    streaming = false,
): Promise<string> {
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

    const text = await readResponseText(
        response,
        MAX_COMMUNITY_MEDIA_RESPONSE_BYTES,
        () => new Error("Endpoint response is too large"),
    );
    if (!response.ok) {
        throw new Error(endpointErrorMessage(response.status, parseJson(text)));
    }
    if (
        streaming &&
        !response.headers.get("content-type")?.includes("text/event-stream")
    ) {
        throw new Error("Endpoint did not return a text/event-stream response");
    }
    return text;
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
    return parseJson(await fetchText(url, init));
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
    url,
    api,
    bearerToken,
    model,
}: {
    url: string;
    api: CommunityEndpointApi;
    bearerToken: string;
    model: string;
}): Promise<CommunityEndpointTestResult> {
    const request = {
        model,
        ...(api === "responses"
            ? { input: "Reply with OK.", store: false }
            : { messages: [{ role: "user", content: "Reply with OK." }] }),
    };
    const init = {
        method: "POST",
        headers: {
            ...authorizationHeaders(bearerToken),
            "Content-Type": "application/json",
        },
    };
    const body = await fetchJson(url, {
        ...init,
        body: JSON.stringify({ ...request, stream: false }),
    });
    let result: CommunityEndpointTestResult;
    if (api === "responses") {
        const parsed = CreateResponseResponseSchema.safeParse(body);
        if (
            !parsed.success ||
            !["completed", "incomplete"].includes(parsed.data.status) ||
            !parsed.data.usage
        ) {
            throw new Error(
                "Endpoint did not return a successful Response with valid token usage",
            );
        }
        result = {
            usage: parsed.data.usage,
            billableUsage: responsesUsageToUsage(parsed.data.usage),
        };
    } else {
        const parsed = z
            .object({
                choices: z.array(z.unknown()).min(1),
                usage: CompletionUsageSchema,
            })
            .safeParse(body);
        if (!parsed.success) {
            throw new Error(
                "Endpoint did not return OpenAI chat choices with valid token usage",
            );
        }
        result = {
            usage: parsed.data.usage,
            billableUsage: openaiUsageToUsage(parsed.data.usage),
        };
    }

    const stream = await fetchText(
        url,
        {
            ...init,
            body: JSON.stringify({
                ...request,
                stream: true,
                ...(api === "chat_completions"
                    ? { stream_options: { include_usage: true } }
                    : {}),
            }),
        },
        true,
    );
    let hasUsage = false;
    const parser = createParser({
        onEvent(event) {
            if (event.data === "[DONE]") return;
            const data = parseJson(event.data);
            if (!data || typeof data !== "object")
                throw new Error("Endpoint returned malformed streaming data");
            const type = ("type" in data ? data.type : null) ?? event.event;
            if (
                ("error" in data && data.error != null) ||
                type === "error" ||
                type === "response.failed"
            ) {
                throw new Error("Endpoint returned a streaming error");
            }
            if (api === "responses") {
                if (
                    !["response.completed", "response.incomplete"].includes(
                        String(type),
                    )
                )
                    return;
                const terminal = ResponseTerminalEventSchema.safeParse({
                    ...data,
                    type,
                });
                if (!terminal.success || !terminal.data.response.usage)
                    throw new Error(
                        "Endpoint omitted valid terminal streaming usage",
                    );
                hasUsage = true;
            } else if ("usage" in data && data.usage != null) {
                if (!CompletionUsageSchema.safeParse(data.usage).success)
                    throw new Error(
                        "Endpoint omitted valid terminal streaming usage",
                    );
                hasUsage = true;
            }
        },
    });
    parser.feed(`${stream}\n\n`);
    if (!hasUsage)
        throw new Error("Endpoint omitted valid terminal streaming usage");
    return result;
}

export async function testCommunityImageEndpoint({
    baseUrl,
    bearerToken,
    model,
}: ModelEndpointTestInput): Promise<CommunityEndpointTestResult> {
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

// Video registration uses the same synchronous contract as request-time
// generation: the exact configured URL must return completed playable media.
export async function testCommunityVideoEndpoint({
    baseUrl,
    bearerToken,
}: EndpointAuth): Promise<CommunityEndpointTestResult> {
    const body = await fetchJson(baseUrl, {
        method: "POST",
        headers: {
            ...authorizationHeaders(bearerToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            prompt: "A green sprout gently moving in the breeze.",
            duration: 5,
        }),
    });
    const video = await firstCommunityVideoBytes(body, baseUrl);
    if (!video || !detectVideoMimeType(video)) {
        throw new Error("Endpoint did not return a supported video");
    }
    return {
        usage: { duration: 5 },
        billableUsage: { completionVideoSeconds: 5 },
    };
}

// Transcription endpoints are billed against prompt audio seconds, mirroring
// the first-party whisper/scribe models. The probe uploads a real audio file
// and validates the OpenAI transcription response shape.
export async function testCommunityTranscriptionEndpoint({
    baseUrl,
    bearerToken,
    model,
}: ModelEndpointTestInput): Promise<CommunityEndpointTestResult> {
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

// Speech (TTS) endpoints bill the caller's input by character against the
// same completion-audio fields the first-party TTS models use, so the probe
// meters the request text it sent rather than anything in the response. What
// the probe must prove is only that the endpoint answers a standard
// OpenAI-shaped TTS request with real binary audio.
export async function testCommunitySpeechEndpoint({
    baseUrl,
    bearerToken,
    model,
}: ModelEndpointTestInput): Promise<CommunityEndpointTestResult> {
    const input = "Pollinations speech endpoint test.";
    const response = await fetchCommunityAudio(
        communityAudioSpeechUrl(baseUrl),
        {
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
        },
    );

    if (!response.ok) {
        // Error bodies are JSON on OpenAI-compatible endpoints; surface the
        // upstream message so a wrong voice or format is diagnosable.
        const text = new TextDecoder().decode(
            await readResponseBytes(
                response.clone(),
                MAX_COMMUNITY_MEDIA_RESPONSE_BYTES,
                () => new Error("Endpoint response is too large"),
            ),
        );
        throw new Error(endpointErrorMessage(response.status, parseJson(text)));
    }

    const bytes = await readResponseBytes(
        response,
        MAX_COMMUNITY_MEDIA_RESPONSE_BYTES,
        () => new Error("Endpoint response is too large"),
    );
    const contentType =
        response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!contentType.startsWith("audio/") || bytes.byteLength === 0) {
        throw new Error(
            "Endpoint did not return binary audio (expected an audio/* response body)",
        );
    }
    // No upstream usage object to relay: the gateway meters the request text,
    // so the probe reports the same shape the request path will store.
    return {
        usage: { completionAudioTokens: input.length },
        billableUsage: { completionAudioTokens: input.length },
    };
}

async function fetchCommunityAudio(
    url: string,
    init: RequestInit,
): Promise<Response> {
    try {
        // Same redirect posture as fetchJson: the base URL is validated
        // before we fetch, so following redirects would let the probe bounce
        // to an unvalidated destination.
        return await fetch(url, {
            ...init,
            redirect: "manual",
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        });
    } catch {
        throw new Error("Endpoint request timed out or could not connect");
    }
}

export async function testCommunityEmbeddingEndpoint({
    baseUrl,
    bearerToken,
    model,
}: ModelEndpointTestInput): Promise<CommunityEndpointTestResult> {
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

async function testCommunityImageEdits(
    { baseUrl, bearerToken, model }: ModelEndpointTestInput,
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
