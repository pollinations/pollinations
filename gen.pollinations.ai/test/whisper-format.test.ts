import { describe, expect, it } from "vitest";
import {
    assertTranscriptionResponseFormat,
    buildTranscriptionResponse,
    type NormalizedTranscript,
    UNDIARIZED_TRANSCRIPTION_RESPONSE_FORMATS,
} from "../src/routes/transcription-response.ts";

/** OVH whisper, normalized the way the transcription route hands it over. */
const WHISPER: NormalizedTranscript = {
    text: "El ciclo del agua",
    language: "es",
    duration: 3.5,
    words: [],
    segments: [
        { start: 0, end: 1.5, text: "El ciclo" },
        { start: 1.5, end: 3.5, text: " del agua" },
    ],
    diarizedSegments: [],
};

const usageHeaders = { "x-usage-seconds": "3.5" };

function format(
    normalized: NormalizedTranscript,
    responseFormat: string,
): Response {
    return buildTranscriptionResponse({
        normalized,
        responseFormat,
        usageHeaders,
    });
}

describe("whisper through the shared transcription formatter", () => {
    it("returns plain text for response_format=text (the #9028 bug)", async () => {
        const res = format(WHISPER, "text");
        expect(res.headers.get("content-type")).toBe(
            "text/plain; charset=utf-8",
        );
        expect(res.headers.get("x-usage-seconds")).toBe("3.5");
        expect(await res.text()).toBe("El ciclo del agua");
    });

    it("defaults to OpenAI-style { text } json", async () => {
        const res = format(WHISPER, "json");
        expect(res.headers.get("content-type")).toContain("application/json");
        expect(await res.json()).toEqual({
            text: "El ciclo del agua",
            usage: { type: "duration", seconds: 3.5 },
        });
    });

    it("re-emits OVH's bare usage in OpenAI's duration shape", async () => {
        const res = format(WHISPER, "verbose_json");
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.usage).toEqual({ type: "duration", seconds: 3.5 });
        expect(body.text).toBe("El ciclo del agua");
        expect(body.segments).toHaveLength(2);
    });

    it("fills every field OpenAI declares on a segment", async () => {
        const res = format(WHISPER, "verbose_json");
        const body = (await res.json()) as { segments: object[] };
        // openai-python parses these into a pydantic model, so a segment
        // missing any declared field makes a typed client raise.
        expect(Object.keys(body.segments[0]).sort()).toEqual([
            "avg_logprob",
            "compression_ratio",
            "end",
            "id",
            "no_speech_prob",
            "seek",
            "start",
            "temperature",
            "text",
            "tokens",
        ]);
    });

    it("builds SRT cues from segments", async () => {
        const res = format(WHISPER, "srt");
        const srt = await res.text();
        expect(res.headers.get("content-type")).toBe(
            "text/plain; charset=utf-8",
        );
        expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,500\nEl ciclo");
        expect(srt).toContain("2\n00:00:01,500 --> 00:00:03,500\ndel agua");
    });

    it("builds VTT with a WEBVTT header and dot separators", async () => {
        const res = format(WHISPER, "vtt");
        const vtt = await res.text();
        expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
        expect(vtt).toContain("00:00:00.000 --> 00:00:01.500");
    });

    it("rejects unsupported Whisper response formats", () => {
        expect(() =>
            assertTranscriptionResponseFormat(
                "diarized_json",
                "whisper model",
                UNDIARIZED_TRANSCRIPTION_RESPONSE_FORMATS,
            ),
        ).toThrow(
            "Unsupported response_format for whisper model: diarized_json",
        );
    });
});

describe("subtitles when the provider reports no segments", () => {
    // OVH answers segments: [] on every request while still returning word
    // timings, which is why asking whisper for srt used to return an empty
    // body (#13552).
    const wordsOnly: NormalizedTranscript = {
        text: "Hello world",
        duration: 0.9,
        words: [
            { word: "Hello", start: 0, end: 0.26 },
            { word: "world.", start: 0.26, end: 0.9 },
        ],
        segments: [],
        diarizedSegments: [],
    };

    it("derives cues from word timings", async () => {
        const srt = await format(wordsOnly, "srt").text();
        expect(srt).toBe("1\n00:00:00,000 --> 00:00:00,900\nHello world.\n");
    });

    it("splits cues on sentence boundaries", async () => {
        const twoSentences: NormalizedTranscript = {
            ...wordsOnly,
            text: "Hi there. Bye.",
            duration: 4,
            words: [
                { word: "Hi", start: 0, end: 0.5 },
                { word: "there.", start: 0.5, end: 1 },
                { word: "Bye.", start: 3, end: 4 },
            ],
        };
        const srt = await format(twoSentences, "srt").text();
        expect(srt).toBe(
            "1\n00:00:00,000 --> 00:00:01,000\nHi there.\n\n" +
                "2\n00:00:03,000 --> 00:00:04,000\nBye.\n",
        );
    });

    it("falls back to one file-spanning cue with neither segments nor words", async () => {
        const bare: NormalizedTranscript = {
            ...wordsOnly,
            words: [],
        };
        const srt = await format(bare, "srt").text();
        expect(srt).toBe("1\n00:00:00,000 --> 00:00:00,900\nHello world\n");
    });

    it("emits no cues for silence rather than an empty one", async () => {
        const silent: NormalizedTranscript = {
            ...wordsOnly,
            text: "   ",
            words: [],
        };
        expect(await format(silent, "srt").text()).toBe("\n");
        const body = (await format(silent, "verbose_json").json()) as {
            segments: unknown[];
        };
        expect(body.segments).toEqual([]);
    });
});
