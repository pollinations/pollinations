import {
    type CommunityEndpointRuntime,
    communityAudioTranscriptionsUrl,
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
    if (options.responseFormat) {
        upstreamFormData.append("response_format", options.responseFormat);
    }
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

// OpenAI-compatible transcription endpoints report audio duration as
// usage.duration (OpenAI) or usage.seconds (whisper-style). A missing value
// bills zero seconds — callers are never charged more than reported.
function transcriptionDuration(bodyText: string): number {
    let parsed: unknown;
    try {
        parsed = JSON.parse(bodyText);
    } catch {
        return 0;
    }
    if (
        !parsed ||
        typeof parsed !== "object" ||
        !("usage" in parsed) ||
        !parsed.usage ||
        typeof parsed.usage !== "object"
    ) {
        return 0;
    }
    const usage = parsed.usage as {
        duration?: unknown;
        seconds?: unknown;
    };
    const seconds =
        typeof usage.duration === "number" ? usage.duration : usage.seconds;
    if (
        typeof seconds !== "number" ||
        !Number.isFinite(seconds) ||
        seconds < 0
    ) {
        return 0;
    }
    return seconds;
}
