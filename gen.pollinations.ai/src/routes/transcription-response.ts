/**
 * Shared OpenAI-compatible transcription-response formatter.
 *
 * Providers (ElevenLabs Scribe, AssemblyAI) each normalize their upstream
 * payload into the seconds-based `NormalizedTranscript` intermediate below
 * — keeping their own grouping and unit conversion — then call
 * `buildTranscriptionResponse` to emit the response branches identically.
 */

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

export interface NormalizedSubtitleSegment {
    start: number;
    end: number;
    text: string;
}

export interface NormalizedTranscript {
    text: string;
    /** ISO-639-1 language code, or undefined if unknown. */
    language?: string;
    /** Duration in seconds. */
    duration: number;
    words: NormalizedWord[];
    diarizedSegments: NormalizedDiarizedSegment[];
    subtitleSegments?: NormalizedSubtitleSegment[];
    /** Provider verbose_json body to preserve when the provider already returned one. */
    verboseJson?: Record<string, unknown>;
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

/** Format SRT/VTT timestamps from seconds. SRT uses a comma, VTT a dot. */
function formatTimestamp(seconds: number, sep: "," | "."): string {
    const ms = Math.round(seconds * 1000);
    const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
    const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
    const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
    const msPart = String(ms % 1000).padStart(3, "0");
    return `${h}:${m}:${s}${sep}${msPart}`;
}

function toSubtitles(
    segments: NormalizedSubtitleSegment[],
    kind: "srt" | "vtt",
): string {
    const sep = kind === "srt" ? "," : ".";
    const cues = segments.map((seg, i) => {
        const time = `${formatTimestamp(seg.start, sep)} --> ${formatTimestamp(seg.end, sep)}`;
        const head = kind === "srt" ? `${i + 1}\n` : "";
        return `${head}${time}\n${seg.text.trim()}`;
    });
    return kind === "vtt"
        ? `WEBVTT\n\n${cues.join("\n\n")}\n`
        : `${cues.join("\n\n")}\n`;
}

function buildVerboseJsonBody(
    normalized: NormalizedTranscript,
): Record<string, unknown> {
    if (normalized.verboseJson) {
        const { usage: _usage, ...body } = normalized.verboseJson;
        return body;
    }

    return {
        text: normalized.text,
        task: "transcribe",
        language: normalized.language || "unknown",
        duration: normalized.duration,
        words: normalized.words,
        segments: [
            {
                id: 0,
                start: 0,
                end: normalized.duration,
                text: normalized.text,
            },
        ],
    };
}

export function buildTranscriptionResponse(opts: {
    normalized: NormalizedTranscript;
    responseFormat?: string | null;
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
        return Response.json(buildVerboseJsonBody(normalized), {
            headers: usageHeaders,
        });
    }

    if (responseFormat === "srt" || responseFormat === "vtt") {
        return new Response(
            toSubtitles(normalized.subtitleSegments ?? [], responseFormat),
            {
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    ...usageHeaders,
                },
            },
        );
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
