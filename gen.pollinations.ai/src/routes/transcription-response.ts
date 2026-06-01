/**
 * Shared OpenAI-compatible transcription-response formatter.
 *
 * Providers (ElevenLabs Scribe, AssemblyAI) each normalize their upstream
 * payload into the seconds-based `NormalizedTranscript` intermediate below
 * — keeping their own grouping and unit conversion — then call
 * `buildTranscriptionResponse` to emit the four response branches
 * (text / verbose_json / diarized_json / json) identically.
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
