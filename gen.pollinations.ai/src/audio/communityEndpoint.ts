import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointRuntime,
    communityAudioTranscriptionsUrl,
    communityTranscriptionSeconds,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
} from "@shared/registry/usage-headers.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    assertTranscriptionResponseFormat,
    buildTranscriptionResponse,
} from "../routes/transcription-response.ts";

const COMMUNITY_TRANSCRIPTION_RESPONSE_FORMATS = [
    "json",
    "text",
    "verbose_json",
] as const;

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
    if (endpoint.kind !== "external") {
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
        COMMUNITY_TRANSCRIPTION_RESPONSE_FORMATS,
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
            words: [],
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
    };
}
