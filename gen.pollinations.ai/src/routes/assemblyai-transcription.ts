import type { Logger } from "@logtape/logtape";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
} from "@shared/registry/usage-headers.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ensureUpstreamOk, UpstreamError } from "@/error.ts";

const ASSEMBLYAI_API_BASE = "https://api.assemblyai.com";
const ASSEMBLYAI_POLL_INTERVAL_MS = 2_000;
const ASSEMBLYAI_TRANSCRIPTION_TIMEOUT_MS = 120_000;
const ASSEMBLYAI_MODELS: Record<string, string[]> = {
    "universal-2": ["universal-2"],
    "universal-3-pro": ["universal-3-pro", "universal-2"],
};

interface AssemblyAiUploadResponse {
    upload_url?: string;
}

interface AssemblyAiWord {
    text?: string;
    word?: string;
    start?: number;
    end?: number;
}

interface AssemblyAiTranscriptResponse {
    id?: string;
    status?: "queued" | "processing" | "completed" | "error";
    error?: string;
    error_code?: string | null;
    text?: string | null;
    audio_duration?: number | null;
    language_code?: string | null;
    speech_model_used?: string | null;
    words?: AssemblyAiWord[] | null;
}

export async function transcribeWithAssemblyAi(opts: {
    file: File;
    language?: string;
    prompt?: string;
    responseFormat?: string;
    temperature?: number;
    model: string;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const {
        file,
        language,
        prompt,
        responseFormat = "json",
        temperature,
        model,
        apiKey,
        log,
    } = opts;

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message:
                "AssemblyAI transcription service is not configured (missing API key)",
        });
    }

    if (
        responseFormat &&
        !["json", "text", "verbose_json", "srt", "vtt"].includes(responseFormat)
    ) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Unsupported response_format for AssemblyAI model: ${responseFormat}. Supported: json, text, verbose_json, srt, vtt`,
        });
    }
    if (
        temperature !== undefined &&
        (!Number.isFinite(temperature) || temperature < 0 || temperature > 1)
    ) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: "temperature must be a number between 0 and 1",
        });
    }

    const speechModels = ASSEMBLYAI_MODELS[model];
    if (!speechModels) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Unsupported AssemblyAI model: ${model}`,
        });
    }

    log.info("AssemblyAI transcription: model={model}, format={format}", {
        model,
        format: responseFormat,
    });

    const uploadData = await uploadAssemblyAiFile(file, apiKey);
    const submitted = await submitAssemblyAiTranscript({
        uploadUrl: uploadData.upload_url,
        speechModels,
        language,
        prompt,
        temperature,
        apiKey,
    });
    const transcript = await pollAssemblyAiTranscript({
        id: submitted.id,
        apiKey,
        log,
    });

    const modelUsed = getAssemblyAiRegistryModel(
        transcript.speech_model_used,
        model,
    );
    const duration = getAssemblyAiDuration(transcript, log);
    const usageHeaders = buildUsageHeaders(
        modelUsed,
        createAudioSecondsUsage(duration),
    );

    if (responseFormat === "srt" || responseFormat === "vtt") {
        return fetchAssemblyAiSubtitles({
            id: submitted.id,
            responseFormat,
            apiKey,
            usageHeaders,
        });
    }

    return buildAssemblyAiTranscriptResponse({
        transcript,
        responseFormat,
        duration,
        usageHeaders,
    });
}

async function uploadAssemblyAiFile(
    file: File,
    apiKey: string,
): Promise<{ upload_url: string }> {
    const uploadUrl = `${ASSEMBLYAI_API_BASE}/v2/upload`;
    const uploadResponse = await ensureUpstreamOk(
        await fetch(uploadUrl, {
            method: "POST",
            headers: {
                Authorization: apiKey,
                "Content-Type": "application/octet-stream",
            },
            body: file,
        }),
        uploadUrl,
    );
    const uploadData =
        (await uploadResponse.json()) as AssemblyAiUploadResponse;
    if (!uploadData.upload_url) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "AssemblyAI upload response missing upload_url",
        });
    }
    return { upload_url: uploadData.upload_url };
}

async function submitAssemblyAiTranscript(opts: {
    uploadUrl: string;
    speechModels: string[];
    language?: string;
    prompt?: string;
    temperature?: number;
    apiKey: string;
}): Promise<{ id: string }> {
    const { uploadUrl, speechModels, language, prompt, temperature, apiKey } =
        opts;
    const transcriptRequest: Record<string, unknown> = {
        audio_url: uploadUrl,
        speech_models: speechModels,
        punctuate: true,
        format_text: true,
    };
    if (language) {
        transcriptRequest.language_code = normalizeAssemblyAiLanguage(language);
    } else {
        transcriptRequest.language_detection = true;
    }
    if (speechModels[0] === "universal-3-pro") {
        if (prompt) transcriptRequest.prompt = prompt;
        if (temperature !== undefined)
            transcriptRequest.temperature = temperature;
    }

    const transcriptUrl = `${ASSEMBLYAI_API_BASE}/v2/transcript`;
    const submitResponse = await ensureUpstreamOk(
        await fetch(transcriptUrl, {
            method: "POST",
            headers: {
                Authorization: apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(transcriptRequest),
        }),
        transcriptUrl,
    );
    const submitted =
        (await submitResponse.json()) as AssemblyAiTranscriptResponse;
    if (!submitted.id) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "AssemblyAI transcription response missing id",
        });
    }
    return { id: submitted.id };
}

async function pollAssemblyAiTranscript(opts: {
    id: string;
    apiKey: string;
    log: Logger;
}): Promise<AssemblyAiTranscriptResponse> {
    const { id, apiKey, log } = opts;
    const deadline = Date.now() + ASSEMBLYAI_TRANSCRIPTION_TIMEOUT_MS;
    const transcriptUrl = `${ASSEMBLYAI_API_BASE}/v2/transcript/${id}`;

    while (Date.now() < deadline) {
        const response = await ensureUpstreamOk(
            await fetch(transcriptUrl, {
                headers: { Authorization: apiKey },
            }),
            transcriptUrl,
        );
        const transcript =
            (await response.json()) as AssemblyAiTranscriptResponse;

        if (transcript.status === "completed") {
            return transcript;
        }

        if (transcript.status === "error") {
            const message =
                transcript.error || "AssemblyAI transcription failed";
            throw new UpstreamError(
                getAssemblyAiErrorStatus(message, transcript.error_code, log),
                {
                    message,
                },
            );
        }

        log.debug(
            "AssemblyAI transcription pending: id={id}, status={status}",
            {
                id,
                status: transcript.status || "unknown",
            },
        );
        await delay(ASSEMBLYAI_POLL_INTERVAL_MS);
    }

    throw new UpstreamError(504 as ContentfulStatusCode, {
        message: "AssemblyAI transcription timed out",
    });
}

async function fetchAssemblyAiSubtitles(opts: {
    id: string;
    responseFormat: string;
    apiKey: string;
    usageHeaders: Record<string, string>;
}): Promise<Response> {
    const { id, responseFormat, apiKey, usageHeaders } = opts;
    const subtitleUrl = `${ASSEMBLYAI_API_BASE}/v2/transcript/${id}/${responseFormat}`;
    const subtitleResponse = await ensureUpstreamOk(
        await fetch(subtitleUrl, {
            headers: { Authorization: apiKey },
        }),
        subtitleUrl,
    );
    return new Response(await subtitleResponse.text(), {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...usageHeaders,
        },
    });
}

function buildAssemblyAiTranscriptResponse(opts: {
    transcript: AssemblyAiTranscriptResponse;
    responseFormat: string;
    duration: number;
    usageHeaders: Record<string, string>;
}): Response {
    const { transcript, responseFormat, duration, usageHeaders } = opts;
    const text = transcript.text || "";

    if (responseFormat === "text") {
        return new Response(text, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                ...usageHeaders,
            },
        });
    }

    if (responseFormat === "verbose_json") {
        return Response.json(
            {
                text,
                task: "transcribe",
                language: transcript.language_code || "unknown",
                duration,
                words: toOpenAiWords(transcript.words),
                segments: [
                    {
                        id: 0,
                        start: 0,
                        end: duration,
                        text,
                    },
                ],
            },
            { headers: usageHeaders },
        );
    }

    return Response.json({ text }, { headers: usageHeaders });
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAssemblyAiLanguage(language: string): string {
    const normalized = language.trim().toLowerCase().replace("-", "_");
    return normalized === "en" ? "en_us" : normalized;
}

const ASSEMBLYAI_CLIENT_ERROR_CODES = new Set([
    "audio_too_short",
    "invalid_audio",
    "no_audio",
    "no_audio_found",
    "no_speech",
    "transcoding_failed",
    "unsupported_file",
]);

function getAssemblyAiErrorStatus(
    message: string,
    errorCode?: string | null,
    log?: Logger,
): 400 | 500 {
    const normalizedCode = errorCode?.trim().toLowerCase();
    if (normalizedCode && ASSEMBLYAI_CLIENT_ERROR_CODES.has(normalizedCode)) {
        return 400;
    }
    if (normalizedCode) {
        log?.warn(
            "Unrecognized AssemblyAI error_code={code}; defaulting to message-based classification. Add to ASSEMBLYAI_CLIENT_ERROR_CODES if this is a client error.",
            { code: normalizedCode },
        );
    }

    const normalized = message.toLowerCase();
    if (
        normalized.includes("no spoken audio") ||
        normalized.includes("does not appear to contain audio") ||
        normalized.includes("audio duration is too short") ||
        normalized.includes("no audio stream found")
    ) {
        return 400;
    }
    return 500;
}

function getAssemblyAiRegistryModel(
    speechModelUsed: string | null | undefined,
    fallbackModel: string,
): string {
    if (speechModelUsed === "universal-2") return "universal-2";
    if (speechModelUsed === "universal-3-pro") return "universal-3-pro";
    return fallbackModel;
}

function getAssemblyAiDuration(
    transcript: AssemblyAiTranscriptResponse,
    log: Logger,
): number {
    if (
        typeof transcript.audio_duration === "number" &&
        transcript.audio_duration > 0
    ) {
        return transcript.audio_duration;
    }

    const lastWordEndMs = transcript.words?.at(-1)?.end;
    if (typeof lastWordEndMs === "number" && lastWordEndMs > 0) {
        return lastWordEndMs / 1000;
    }

    log.warn("AssemblyAI response missing audio_duration; billing 0s");
    return 0;
}

function toOpenAiWords(
    words: AssemblyAiWord[] | null | undefined,
): { word: string; start: number; end: number }[] {
    return (
        words?.map((word) => ({
            word: word.text || word.word || "",
            start: typeof word.start === "number" ? word.start / 1000 : 0,
            end: typeof word.end === "number" ? word.end / 1000 : 0,
        })) ?? []
    );
}
