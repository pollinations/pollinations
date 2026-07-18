import {
    type CommunityEndpointRuntime,
    communitySpeechUrl,
    communityTranscriptionsUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import {
    buildUsageHeaders,
    createAudioTokenUsage,
    getOpenAITranscriptionDuration,
    getOpenAITranscriptionTokenUsage,
    openaiTranscriptionUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    formatWhisperResponse,
    validateWhisperResponseFormat,
    type WhisperSegment,
    type WhisperVerboseJson,
} from "@/routes/transcription-response.ts";

const REQUEST_TIMEOUT_MS = 240_000;

export async function generateCommunitySpeech(
    endpoint: CommunityEndpointRuntime,
    request: {
        input: string;
        voice: string;
        responseFormat: string;
        instructions?: string;
        speed?: number;
    },
    responseModel: string,
    secret: string,
): Promise<Response> {
    const upstreamUrl = communitySpeechUrl(endpoint.baseUrl);
    const response = await communityFetch(endpoint, upstreamUrl, secret, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: endpoint.upstreamModel,
            input: request.input,
            voice: request.voice,
            response_format: request.responseFormat,
            ...(request.instructions
                ? { instructions: request.instructions }
                : {}),
            ...(request.speed !== undefined ? { speed: request.speed } : {}),
        }),
    });
    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length");
    if (
        !isAudioContentType(contentType) ||
        !response.body ||
        contentLength === "0"
    ) {
        throw invalidResponse(
            upstreamUrl,
            "Community speech endpoint returned invalid audio",
        );
    }

    const headers = {
        "Content-Type": contentType,
        ...buildUsageHeaders(responseModel, createAudioTokenUsage(1)),
        ...(contentLength ? { "Content-Length": contentLength } : {}),
    };
    return new Response(response.body, { headers });
}

export async function generateCommunityTranscription(
    endpoint: CommunityEndpointRuntime,
    file: File,
    requestForm: FormData,
    responseFormat: string | null,
    responseModel: string,
    secret: string,
): Promise<Response> {
    validateWhisperResponseFormat(responseFormat);
    const upstreamForm = new FormData();
    upstreamForm.append(
        "file",
        file,
        file.name && file.name !== "blob" ? file.name : "audio.wav",
    );
    upstreamForm.append("model", endpoint.upstreamModel);
    const upstreamResponseFormat =
        responseFormat === "verbose_json" ||
        responseFormat === "srt" ||
        responseFormat === "vtt"
            ? "verbose_json"
            : "json";
    upstreamForm.append("response_format", upstreamResponseFormat);
    copyStringField(requestForm, upstreamForm, "language");
    copyStringField(requestForm, upstreamForm, "prompt");
    copyStringField(requestForm, upstreamForm, "temperature");
    for (const value of requestForm.getAll("timestamp_granularities[]")) {
        if (typeof value === "string") {
            upstreamForm.append("timestamp_granularities[]", value);
        }
    }

    const upstreamUrl = communityTranscriptionsUrl(endpoint.baseUrl);
    const response = await communityFetch(endpoint, upstreamUrl, secret, {
        method: "POST",
        body: upstreamForm,
    });
    const body = await response.json().catch(() => null);
    const seconds = getOpenAITranscriptionDuration(body);
    if (
        !body ||
        typeof body !== "object" ||
        !("text" in body) ||
        typeof body.text !== "string"
    ) {
        throw invalidResponse(
            upstreamUrl,
            "Community transcription endpoint returned an invalid response",
        );
    }
    const segments = "segments" in body ? body.segments : undefined;
    if (
        (responseFormat === "srt" || responseFormat === "vtt") &&
        (!Array.isArray(segments) || !segments.every(isWhisperSegment))
    ) {
        throw invalidResponse(
            upstreamUrl,
            "Community transcription endpoint did not return subtitle segments",
        );
    }

    const normalized: WhisperVerboseJson = {
        ...(body as Record<string, unknown>),
        text: body.text,
        ...(seconds ? { duration: seconds } : {}),
        ...(Array.isArray(segments)
            ? { segments: segments as WhisperSegment[] }
            : {}),
    };
    const tokenUsage = getOpenAITranscriptionTokenUsage(body);
    const usesFixedPrice = endpoint.completionAudioPrice > 0;
    const hasTokenPrice =
        endpoint.promptTextPrice > 0 ||
        endpoint.promptAudioPrice > 0 ||
        endpoint.completionTextPrice > 0;
    if (!usesFixedPrice && hasTokenPrice && !tokenUsage) {
        throw invalidResponse(
            upstreamUrl,
            "Community transcription endpoint did not return token usage required by its pricing",
        );
    }
    const billableUsage =
        !usesFixedPrice && tokenUsage
            ? openaiTranscriptionUsageToUsage(tokenUsage)
            : createAudioTokenUsage(1);
    return formatWhisperResponse(
        normalized,
        responseFormat,
        buildUsageHeaders(responseModel, billableUsage),
    );
}

async function communityFetch(
    endpoint: CommunityEndpointRuntime,
    url: string,
    secret: string,
    init: RequestInit,
): Promise<Response> {
    const token = normalizeCommunityEndpointBearerToken(
        await decryptSecret(endpoint.bearerTokenCiphertext, secret),
    );
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    let response: Response;
    try {
        response = await fetch(url, {
            ...init,
            headers,
            redirect: "manual",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message: "Community audio endpoint timed out or could not connect",
            requestUrl: new URL(url),
            cause: error,
        });
    }
    await ensureUpstreamOk(response, url);
    return response;
}

function copyStringField(from: FormData, to: FormData, name: string): void {
    const value = from.get(name);
    if (typeof value === "string" && value !== "") to.append(name, value);
}

function isAudioContentType(value: string): boolean {
    const mime = value.split(";", 1)[0]?.trim().toLowerCase();
    return mime?.startsWith("audio/") || mime === "application/octet-stream";
}

function isWhisperSegment(value: unknown): value is WhisperSegment {
    return (
        value !== null &&
        typeof value === "object" &&
        "start" in value &&
        typeof value.start === "number" &&
        Number.isFinite(value.start) &&
        "end" in value &&
        typeof value.end === "number" &&
        Number.isFinite(value.end) &&
        value.end >= value.start &&
        "text" in value &&
        typeof value.text === "string"
    );
}

function invalidResponse(url: string, message: string): UpstreamError {
    return new UpstreamError(502 as ContentfulStatusCode, {
        message,
        requestUrl: new URL(url),
    });
}
