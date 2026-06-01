import { describe, expect, it } from "vitest";
import { formatWhisperResponse } from "../src/routes/audio.ts";

const VERBOSE = {
    text: "El ciclo del agua",
    usage: { seconds: 3.5 },
    segments: [
        { start: 0, end: 1.5, text: "El ciclo" },
        { start: 1.5, end: 3.5, text: " del agua" },
    ],
};
const usageHeaders = { "x-usage-seconds": "3.5" };

describe("formatWhisperResponse", () => {
    it("returns plain text for response_format=text (the #9028 bug)", async () => {
        const res = formatWhisperResponse(VERBOSE, "text", usageHeaders);
        expect(res.headers.get("content-type")).toBe(
            "text/plain; charset=utf-8",
        );
        expect(res.headers.get("x-usage-seconds")).toBe("3.5");
        expect(await res.text()).toBe("El ciclo del agua");
    });

    it("defaults to OpenAI-style { text } json", async () => {
        const res = formatWhisperResponse(VERBOSE, null, usageHeaders);
        expect(res.headers.get("content-type")).toContain("application/json");
        expect(await res.json()).toEqual({ text: "El ciclo del agua" });
    });

    it("strips internal usage from verbose_json", async () => {
        const res = formatWhisperResponse(
            VERBOSE,
            "verbose_json",
            usageHeaders,
        );
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.usage).toBeUndefined();
        expect(body.text).toBe("El ciclo del agua");
        expect(body.segments).toHaveLength(2);
    });

    it("builds SRT cues from segments", async () => {
        const res = formatWhisperResponse(VERBOSE, "srt", usageHeaders);
        const srt = await res.text();
        expect(res.headers.get("content-type")).toBe(
            "text/plain; charset=utf-8",
        );
        expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,500\nEl ciclo");
        expect(srt).toContain("2\n00:00:01,500 --> 00:00:03,500\ndel agua");
    });

    it("builds VTT with a WEBVTT header and dot separators", async () => {
        const res = formatWhisperResponse(VERBOSE, "vtt", usageHeaders);
        const vtt = await res.text();
        expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
        expect(vtt).toContain("00:00:00.000 --> 00:00:01.500");
    });
});
