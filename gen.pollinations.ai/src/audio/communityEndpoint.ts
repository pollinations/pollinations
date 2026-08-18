import {
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

const REQUEST_TIMEOUT_MS = 300_000;

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
    // When the caller asks for nothing we send json rather than letting the
    // endpoint pick: json is OpenAI's default anyway, and it is the exact shape
    // the registration probe proved this endpoint meters. Anything the caller
    // does ask for is forwarded as-is — the endpoint owns which formats it
    // supports, and its errors reach the caller unchanged.
    const responseFormat = options.responseFormat ?? "json";
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
    upstreamFormData.append("response_format", responseFormat);
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
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message:
                "Community transcription endpoint timed out or could not connect",
            cause: error,
            requestUrl: new URL(upstreamUrl),
        });
    }
    response = await ensureUpstreamOk(response, upstreamUrl);

    const bodyText = await response.text();
    const duration = transcriptionDuration(bodyText);
    const usageHeaders = buildUsageHeaders(
        endpoint.modelId,
        createAudioSecondsUsage(duration),
    );

    return new Response(bodyText, {
        status: response.status,
        headers: {
            ...(response.headers.get("content-type")
                ? {
                      "Content-Type": response.headers.get(
                          "content-type",
                      ) as string,
                  }
                : {}),
            ...usageHeaders,
        },
    });
}

// The duration is the meter, so an endpoint that does not report one is a
// provider regression rather than a free request — the same stance every other
// per-second path takes (getUploadedMusicDurationSeconds, extractWhisperUsage)
// and the same stance the image path takes on missing token usage. The
// registration probe rejects endpoints that cannot report, so reaching this is
// a regression in an endpoint that could.
function transcriptionDuration(bodyText: string): number {
    let parsed: unknown;
    try {
        parsed = JSON.parse(bodyText);
    } catch {
        parsed = null;
    }
    const seconds = communityTranscriptionSeconds(parsed);
    if (seconds === null) {
        throw new UpstreamError(502 as ContentfulStatusCode, {
            message:
                "Community transcription endpoint did not report audio duration",
        });
    }
    return seconds;
}
