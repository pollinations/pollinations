/**
 * Shared OpenAI-compatible transcription-response formatter.
 *
 * Providers (ElevenLabs Scribe, AssemblyAI) each normalize their upstream
 * payload into the seconds-based `NormalizedTranscript` intermediate below
 * — keeping their own grouping and unit conversion — then call
 * `buildTranscriptionResponse` to emit the four response branches
 * (text / verbose_json / diarized_json / json) identically.
 */

import { UpstreamError } from "@shared/error.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface WhisperSegment {
    start: number;
    end: number;
    text: string;
}

export interface WhisperVerboseJson {
    text: string;
    duration?: number;
    usage?: { seconds?: number };
    segments?: WhisperSegment[];
    [key: string]: unknown;
}

const WHISPER_RESPONSE_FORMATS = [
    "json",
    "text",
    "verbose_json",
    "srt",
    "vtt",
] as const;

type WhisperResponseFormat = (typeof WHISPER_RESPONSE_FORMATS)[number];

export function validateWhisperResponseFormat(
    responseFormat: string | null,
): void {
    if (
        responseFormat &&
        !WHISPER_RESPONSE_FORMATS.includes(
            responseFormat as WhisperResponseFormat,
        )
    ) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Unsupported response_format for whisper model: ${responseFormat}. Supported: ${WHISPER_RESPONSE_FORMATS.join(", ")}`,
        });
    }
}

/** Format SRT/VTT timestamps from seconds. SRT uses a comma, VTT a dot. */
function formatTimestamp(seconds: number, sep: "," | "."): string {
    const ms = Math.round(seconds * 1000);
    const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
    const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
    const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
    const msPart = String(ms % 1000).padStart(3, "0");
    return `${h}:${m}:${s}${sep}${msPart}`;
}

function toSubtitles(segments: WhisperSegment[], kind: "srt" | "vtt"): string {
    const sep = kind === "srt" ? "," : ".";
    const cues = segments.map((segment, index) => {
        const time = `${formatTimestamp(segment.start, sep)} --> ${formatTimestamp(segment.end, sep)}`;
        const head = kind === "srt" ? `${index + 1}\n` : "";
        return `${head}${time}\n${segment.text.trim()}`;
    });
    return kind === "vtt"
        ? `WEBVTT\n\n${cues.join("\n\n")}\n`
        : `${cues.join("\n\n")}\n`;
}

export function formatWhisperResponse(
    json: WhisperVerboseJson,
    responseFormat: string | null,
    usageHeaders: Record<string, string>,
): Response {
    validateWhisperResponseFormat(responseFormat);

    if (responseFormat === "text") {
        return new Response(json.text, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                ...usageHeaders,
            },
        });
    }

    if (responseFormat === "srt" || responseFormat === "vtt") {
        return new Response(toSubtitles(json.segments ?? [], responseFormat), {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                ...usageHeaders,
            },
        });
    }

    if (responseFormat === "verbose_json") {
        const { usage: _usage, ...rest } = json;
        return Response.json(rest, { headers: usageHeaders });
    }

    return Response.json({ text: json.text }, { headers: usageHeaders });
}

export interface NormalizedWord {
    word: string;
    start: number;
    end: number;
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

export function buildTranscriptionResponse(opts: {
    normalized: NormalizedTranscript;
    responseFormat: string;
    usageHeaders: Record<string, string>;
}): Response {
    const { normalized, responseFormat, usageHeaders } = opts;
    const { text, duration } = normalized;

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
            segments: [
                {
                    id: 0,
                    start: 0,
                    end: duration,
                    text,
                },
            ],
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
                usage: {
                    type: "duration",
                    seconds: duration,
                },
            },
            { headers: usageHeaders },
        );
    }

    // Default: json format
    return Response.json({ text }, { headers: usageHeaders });
}
