import {
    communityAudioSpeechUrl,
    communityAudioTranscriptionsUrl,
} from "@shared/community-endpoint-urls.ts";
import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointRuntime,
    communityTranscriptionSeconds,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
    createAudioTokenUsage,
} from "@shared/registry/usage-headers.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    assertTranscriptionResponseFormat,
    buildTranscriptionResponse,
    type NormalizedSegment,
    type NormalizedWord,
    UNDIARIZED_TRANSCRIPTION_RESPONSE_FORMATS,
} from "../routes/transcription-response.ts";

export type CommunitySpeechOptions = {
    input: string;
    voice?: string;
    responseFormat?: string;
};

/**
 * Forward an OpenAI-compatible text-to-speech request to a community
 * endpoint. Only the standard contract fields travel upstream — `model`,
 * `input`, `voice`, `response_format` — and the returned audio bytes and
 * format are preserved for the caller. Billing is character-based: the meter
 * is the input length Pollinations sends, reported as completion audio tokens
 * (the same usage type the first-party TTS models bill characters on).
 */
export async function callCommunitySpeechEndpoint(
    endpoint: CommunityEndpointRuntime,
    options: CommunitySpeechOptions,
    secret: string,
): Promise<Response> {
    // Managed agents are text-only, so a speech endpoint is always external.
    if (endpoint.type !== "proxy") {
        throw new Error(
            `Community speech endpoint '${endpoint.modelId}' is a managed agent`,
        );
    }
    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    const upstreamUrl = communityAudioSpeechUrl(endpoint.baseUrl);

    let response: Response;
    try {
        response = await fetch(upstreamUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${normalizeCommunityEndpointBearerToken(
                    bearerToken,
                )}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: endpoint.upstreamModel,
                input: options.input,
                voice: options.voice ?? "alloy",
                response_format: options.responseFormat ?? "mp3",
            }),
            redirect: "manual",
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        });
    } catch (error) {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message: "Community speech endpoint timed out or could not connect",
            cause: error,
            requestUrl: new URL(upstreamUrl),
        });
    }
    response = await ensureUpstreamOk(response, upstreamUrl);

    const audio = await response.arrayBuffer();
    // Preserve the returned audio format: trust an audio/* content-type as-is
    // and label anything else as a generic binary stream so clients do not
    // misinterpret a mislabeled payload.
    const upstreamContentType = response.headers.get("content-type");
    const contentType = upstreamContentType?.toLowerCase().startsWith("audio/")
        ? upstreamContentType
        : "application/octet-stream";
    return new Response(audio, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            ...buildUsageHeaders(
                endpoint.modelId,
                createAudioTokenUsage(options.input.length),
            ),
        },
    });
}

export type CommunityTranscriptionOptions = {
    file: File;
    language?: string;
    prompt?: string;
    responseFormat?: string;
    temperature?: number;
};

export async function callCommunityTranscriptionEndpoint(
    endpoint: CommunityEndpointRuntime,
    options: CommunityTranscriptionOptions,
    secret: string,
): Promise<Response> {
    // Managed agents are text-only, so a transcription endpoint is always external.
    if (endpoint.type !== "proxy") {
        throw new Error(
            `Community transcription endpoint '${endpoint.modelId}' is a managed agent`,
        );
    }
    const responseFormat = options.responseFormat ?? "json";
    // No diarized_json: we never ask the endpoint to diarize and plain json
    // carries no speaker data, so that branch would answer with segments: [].
    assertTranscriptionResponseFormat(
        responseFormat,
        endpoint.modelId,
        UNDIARIZED_TRANSCRIPTION_RESPONSE_FORMATS,
    );

    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    const upstreamUrl = communityAudioTranscriptionsUrl(endpoint.baseUrl);

    const upstreamFormData = new FormData();
    const filename =
        options.file.name && options.file.name !== "blob"
            ? options.file.name
            : "audio.mp3";
    upstreamFormData.append("file", options.file, filename);
    upstreamFormData.append("model", endpoint.upstreamModel);
    if (options.language) upstreamFormData.append("language", options.language);
    if (options.prompt) upstreamFormData.append("prompt", options.prompt);
    // Pin the upstream format instead of forwarding the caller's, the way
    // whisper/grok/scribe do, and pin the same one our own whisper backend
    // asks for. Community endpoints are self-hosted whisper servers, which
    // report the audio duration only in verbose_json — plain json gives back a
    // bare { text } with nothing to meter, and text/srt/vtt carry no usage at
    // all. This is the exact shape the registration probe proved this endpoint
    // meters. The caller's format is served from the parsed result below.
    upstreamFormData.append("response_format", "verbose_json");
    if (options.temperature !== undefined) {
        upstreamFormData.append("temperature", String(options.temperature));
    }

    let response: Response;
    try {
        response = await fetch(upstreamUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${normalizeCommunityEndpointBearerToken(
                    bearerToken,
                )}`,
            },
            body: upstreamFormData,
            redirect: "manual",
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        });
    } catch (error) {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message:
                "Community transcription endpoint timed out or could not connect",
            cause: error,
            requestUrl: new URL(upstreamUrl),
        });
    }
    // Endpoints that only speak plain json (gpt-4o-transcribe and friends)
    // reject verbose_json outright. Say so instead of surfacing a bare
    // upstream 400, so the owner knows what their endpoint has to support.
    if (response.status === 400) {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message: `Community transcription endpoint '${endpoint.modelId}' rejected response_format=verbose_json. Pollinations requests verbose_json because it reports the audio duration that transcription is billed on; models that only support plain json cannot be used yet.`,
            requestUrl: new URL(upstreamUrl),
        });
    }
    response = await ensureUpstreamOk(response, upstreamUrl);

    const transcript = parseCommunityTranscription(await response.text());
    return buildTranscriptionResponse({
        normalized: {
            text: transcript.text,
            language: transcript.language,
            duration: transcript.duration,
            words: transcript.words,
            segments: transcript.segments,
            // We never ask the endpoint to diarize, so there are no speakers
            // to report; diarized_json is rejected above rather than answered
            // with an empty list.
            diarizedSegments: [],
        },
        responseFormat,
        usageHeaders: buildUsageHeaders(
            endpoint.modelId,
            createAudioSecondsUsage(transcript.duration),
        ),
    });
}

// The duration is the meter, so an endpoint that does not report one is a
// provider regression rather than a free request — the stance whisper, grok
// and scribe all take, and the one the image path takes on missing token
// usage. The registration probe rejects endpoints that cannot report a
// duration, so reaching this means an endpoint that could has stopped.
function parseCommunityTranscription(bodyText: string): {
    text: string;
    language?: string;
    duration: number;
    words: NormalizedWord[];
    segments: NormalizedSegment[];
} {
    let parsed: unknown;
    try {
        parsed = JSON.parse(bodyText);
    } catch {
        parsed = null;
    }
    const duration = communityTranscriptionSeconds(parsed);
    if (duration === null) {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message:
                "Community transcription endpoint did not report the audio duration (expected verbose_json's top-level duration, or usage.seconds) that transcription is billed on",
        });
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.text !== "string") {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message:
                "Community transcription endpoint did not return transcription text",
        });
    }
    return {
        text: record.text,
        language:
            typeof record.language === "string" ? record.language : undefined,
        duration,
        words: toTimedWords(record.words),
        segments: toTimedSegments(record.segments),
    };
}

// verbose_json carries the endpoint's own timings alongside the duration we
// bill on. Take them: a self-hosted whisper server measured these, we did not,
// and dropping them makes the caller's verbose_json poorer than the upstream's.
// Entries that are not fully timed are skipped rather than defaulted, so a
// partial upstream degrades to fewer segments instead of wrong ones.
function toTimedSegments(value: unknown): NormalizedSegment[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { start, end, text } = entry as Record<string, unknown>;
        if (
            typeof start !== "number" ||
            typeof end !== "number" ||
            typeof text !== "string"
        ) {
            return [];
        }
        return [{ start, end, text }];
    });
}

function toTimedWords(value: unknown): NormalizedWord[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { start, end, word } = entry as Record<string, unknown>;
        if (
            typeof start !== "number" ||
            typeof end !== "number" ||
            typeof word !== "string"
        ) {
            return [];
        }
        return [{ word, start, end }];
    });
}
