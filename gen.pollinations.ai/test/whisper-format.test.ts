import { describe, expect, it } from "vitest";
import { validateWhisperResponseFormat } from "../src/routes/audio.ts";
import { buildTranscriptionResponse } from "../src/routes/transcription-response.ts";

const VERBOSE = {
    text: "El ciclo del agua",
    usage: { seconds: 3.5 },
    segments: [
        { start: 0, end: 1.5, text: "El ciclo" },
        { start: 1.5, end: 3.5, text: " del agua" },
    ],
};
const usageHeaders = { "x-usage-seconds": "3.5" };

function buildWhisperResponse(responseFormat: string | null): Response {
    return buildTranscriptionResponse({
        normalized: {
            text: VERBOSE.text,
            duration: VERBOSE.usage.seconds,
            words: [],
            diarizedSegments: [],
            subtitleSegments: VERBOSE.segments,
            verboseJson: { ...VERBOSE },
        },
        responseFormat,
        usageHeaders,
    });
}

describe("buildTranscriptionResponse for Whisper", () => {
    it("returns plain text for response_format=text (the #9028 bug)", async () => {
        const res = buildWhisperResponse("text");
        expect(res.headers.get("content-type")).toBe(
            "text/plain; charset=utf-8",
        );
        expect(res.headers.get("x-usage-seconds")).toBe("3.5");
        expect(await res.text()).toBe("El ciclo del agua");
    });

    it("defaults to OpenAI-style { text } json", async () => {
        const res = buildWhisperResponse(null);
        expect(res.headers.get("content-type")).toContain("application/json");
        expect(await res.json()).toEqual({ text: "El ciclo del agua" });
    });

    it("strips internal usage from verbose_json", async () => {
        const res = buildWhisperResponse("verbose_json");
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.usage).toBeUndefined();
        expect(body.text).toBe("El ciclo del agua");
        expect(body.segments).toHaveLength(2);
    });

    it("builds SRT cues from segments", async () => {
        const res = buildWhisperResponse("srt");
        const srt = await res.text();
        expect(res.headers.get("content-type")).toBe(
            "text/plain; charset=utf-8",
        );
        expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,500\nEl ciclo");
        expect(srt).toContain("2\n00:00:01,500 --> 00:00:03,500\ndel agua");
    });

    it("builds VTT with a WEBVTT header and dot separators", async () => {
        const res = buildWhisperResponse("vtt");
        const vtt = await res.text();
        expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
        expect(vtt).toContain("00:00:00.000 --> 00:00:01.500");
    });

    it("rejects unsupported Whisper response formats", () => {
        expect(() => validateWhisperResponseFormat("diarized_json")).toThrow(
            "Unsupported response_format for whisper model: diarized_json",
        );
    });
});
