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
 * The formats every provider can fill. srt/vtt are absent: cues need real
 * segment boundaries and most providers report none, so a subtitle track
 * could only be invented. whisper reports segments and opts in to both;
 * AssemblyAI serves them from its own rendered subtitles.
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

/** SRT separates milliseconds with a comma, VTT with a dot. */
function formatTimestamp(seconds: number, separator: "," | "."): string {
    const ms = Math.round(seconds * 1000);
    const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
    const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
    const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
    return `${h}:${m}:${s}${separator}${String(ms % 1000).padStart(3, "0")}`;
}

function toSubtitles(
    segments: NormalizedSegment[],
    kind: "srt" | "vtt",
): string {
    const separator = kind === "srt" ? "," : ".";
    const cues = segments.map((segment, index) => {
        const time = `${formatTimestamp(segment.start, separator)} --> ${formatTimestamp(segment.end, separator)}`;
        const head = kind === "srt" ? `${index + 1}\n` : "";
        return `${head}${time}\n${segment.text.trim()}`;
    });
    return kind === "vtt"
        ? `WEBVTT\n\n${cues.join("\n\n")}\n`
        : `${cues.join("\n\n")}\n`;
}

export function buildTranscriptionResponse(opts: {
    normalized: NormalizedTranscript;
    responseFormat: string;
    usageHeaders: Record<string, string>;
    /** Body usage for token-billed models; defaults to duration metering. */
    usage?: Record<string, unknown>;
}): Response {
    const { normalized, responseFormat, usageHeaders } = opts;
    const { text, duration } = normalized;
    // OpenAI defines usage.seconds and the top-level duration as the same
    // quantity — "duration of the input audio" — so they are one number here.
    // That is also what we bill, so the body and the usage headers agree.
    const usage = opts.usage ?? {
        type: "duration" as const,
        seconds: duration,
    };

    if (responseFormat === "text") {
        return new Response(text, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                ...usageHeaders,
            },
        });
    }

    if (responseFormat === "srt" || responseFormat === "vtt") {
        // Text without segments means the provider reported no timings, and
        // cues would have to be invented (#13552 shipped them empty).
        if (text.trim() && !normalized.segments.length) {
            throw new UpstreamError(502 as ContentfulStatusCode, {
                message:
                    "Transcription provider returned no segment timings for subtitles",
            });
        }
        return new Response(toSubtitles(normalized.segments, responseFormat), {
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
            // Prefer what the provider measured. Inventing one file-spanning
            // segment when it already sent real ones would hand the caller
            // worse timings than the upstream produced.
            segments: normalized.segments.length
                ? normalized.segments.map((segment, index) => ({
                      id: index,
                      start: segment.start,
                      end: segment.end,
                      text: segment.text,
                  }))
                : [
                      {
                          id: 0,
                          start: 0,
                          end: duration,
                          text,
                      },
                  ],
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
