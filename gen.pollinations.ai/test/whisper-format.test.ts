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

    it("keeps a placeholder segment when the provider reports none", async () => {
        const noSegments: NormalizedTranscript = { ...WHISPER, segments: [] };
        const body = (await format(noSegments, "verbose_json").json()) as {
            segments: unknown[];
        };
        expect(body.segments).toEqual([
            { id: 0, start: 0, end: 3.5, text: "El ciclo del agua" },
        ]);
    });

    it.each([
        "srt",
        "vtt",
        "diarized_json",
    ])("rejects %s, which whisper cannot produce", (responseFormat) => {
        // OVH answers segments: [] on every request, so subtitles could
        // only be invented here; #13552 was that they came back empty.
        expect(() =>
            assertTranscriptionResponseFormat(
                responseFormat,
                "whisper model",
                UNDIARIZED_TRANSCRIPTION_RESPONSE_FORMATS,
            ),
        ).toThrow(
            `Unsupported response_format for whisper model: ${responseFormat}`,
        );
    });
});
