import { UpstreamError } from "@shared/error.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Shared OpenAI-compatible transcription-response formatter.
 *
 * Providers (whisper, ElevenLabs Scribe, AssemblyAI, xAI, community
 * endpoints) each normalize their upstream payload into the seconds-based
 * `NormalizedTranscript` intermediate below — keeping their own grouping and
 * unit conversion — then call `buildTranscriptionResponse` to emit every
 * response branch identically.
 */

/**
 * The formats `buildTranscriptionResponse` can emit. srt/vtt are absent: cues
 * need real segment boundaries and none of these providers report them, so a
 * subtitle track here could only be invented. AssemblyAI serves those two
 * formats from its own rendered subtitles instead.
 */
export const TRANSCRIPTION_RESPONSE_FORMATS = [
    "json",
    "text",
    "verbose_json",
    "diarized_json",
] as const;

/**
 * For providers we never ask to diarize. diarized_json needs real speaker
 * segments, so offering it would mean answering with an empty list.
 */
export const UNDIARIZED_TRANSCRIPTION_RESPONSE_FORMATS =
    TRANSCRIPTION_RESPONSE_FORMATS.filter(
        (format) => format !== "diarized_json",
    );

/**
 * No-op when the caller did not ask for a format; the default is json.
 *
 * `supported` narrows the set for providers that cannot fill every branch —
 * `diarized_json` needs real speaker segments, so a provider that never
 * requests diarization must reject it rather than answer with `segments: []`.
 */
export function assertTranscriptionResponseFormat(
    responseFormat: string | null | undefined,
    modelLabel: string,
    supported: readonly string[] = TRANSCRIPTION_RESPONSE_FORMATS,
): void {
    if (responseFormat && !supported.includes(responseFormat)) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Unsupported response_format for ${modelLabel}: ${responseFormat}. Supported: ${supported.join(", ")}`,
        });
    }
}

export interface NormalizedWord {
    word: string;
    start: number;
    end: number;
}

export interface NormalizedSegment {
    start: number;
    end: number;
    text: string;
}

export interface NormalizedDiarizedSegment {
    start: number;
    end: number;
    text: string;
    speaker: string | null;
}

export interface NormalizedTranscript {
    text: string;
    /** ISO-639-1 language code, or undefined if unknown. */
    language?: string;
    /** Duration in seconds. */
    duration: number;
    words: NormalizedWord[];
    /**
     * Timed segments as reported upstream, empty when the provider reports
     * none. verbose_json then falls back to a single segment spanning the
     * whole file, which is a placeholder rather than a measurement.
     */
    segments: NormalizedSegment[];
    diarizedSegments: NormalizedDiarizedSegment[];
}

function toOpenAiDiarizedSegments(segments: NormalizedDiarizedSegment[]): {
    type: "transcript.text.segment";
    id: string;
    start: number;
    end: number;
    text: string;
    speaker: string;
}[] {
    return segments.map((segment, index) => ({
        type: "transcript.text.segment",
        id: `seg_${String(index + 1).padStart(3, "0")}`,
        start: segment.start,
        end: segment.end,
        text: segment.text,
        speaker: segment.speaker ?? "unknown",
    }));
}

/**
 * OpenAI's TranscriptionSegment. Every field is required in the published
 * type — openai-python builds a pydantic model from exactly these — so a
 * partial segment makes a typed client raise rather than degrade. None of our
 * providers report the decoder statistics, which therefore carry neutral
 * placeholders: absent data, not measurements.
 */
interface OpenAiSegment {
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
}

function toOpenAiSegments(normalized: NormalizedTranscript): OpenAiSegment[] {
    // One file-spanning placeholder when the provider reports no segments,
    // and none at all for silence, which has nothing to describe.
    const source: NormalizedSegment[] = normalized.segments.length
        ? normalized.segments
        : normalized.text.trim()
          ? [{ start: 0, end: normalized.duration, text: normalized.text }]
          : [];
    return source.map((segment, index) => ({
        id: index,
        seek: 0,
        start: segment.start,
        end: segment.end,
        text: segment.text,
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 0,
        no_speech_prob: 0,
    }));
}

export function buildTranscriptionResponse(opts: {
    normalized: NormalizedTranscript;
    responseFormat: string;
    usageHeaders: Record<string, string>;
}): Response {
    const { normalized, responseFormat, usageHeaders } = opts;
    const { text, duration } = normalized;
    // OpenAI defines usage.seconds and the top-level duration as the same
    // quantity — "duration of the input audio" — so they are one number here.
    // That is also what we bill, so the body and the usage headers agree.
    const usage = { type: "duration" as const, seconds: duration };

    if (responseFormat === "text") {
        return new Response(text, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                ...usageHeaders,
            },
        });
    }

    if (responseFormat === "verbose_json") {
        const body: Record<string, unknown> = {
            text,
            task: "transcribe",
            language: normalized.language || "unknown",
            duration,
            words: normalized.words,
            segments: toOpenAiSegments(normalized),
            usage,
        };
        return Response.json(body, { headers: usageHeaders });
    }

    if (responseFormat === "diarized_json") {
        return Response.json(
            {
                task: "transcribe",
                duration,
                text,
                segments: toOpenAiDiarizedSegments(normalized.diarizedSegments),
                usage,
            },
            { headers: usageHeaders },
        );
    }

    // Default: json format
    return Response.json({ text, usage }, { headers: usageHeaders });
}
