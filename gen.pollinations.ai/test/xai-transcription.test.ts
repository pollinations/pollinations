import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeWithXai } from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
} as never;

describe("transcribeWithXai", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("forwards REST options and bills the returned audio duration", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            Response.json({
                text: "hello there",
                language: "en",
                duration: 3.25,
                words: [
                    { text: "hello", start: 0, end: 0.5, speaker: 0 },
                    { text: "there", start: 0.6, end: 1.1, speaker: 1 },
                ],
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await transcribeWithXai({
            file: new File(["audio"], "audio.wav", { type: "audio/wav" }),
            language: "en",
            responseFormat: "diarized_json",
            apiKey: "test-key",
            log,
        });

        const request = fetchMock.mock.calls[0];
        expect(request[0]).toBe("https://api.x.ai/v1/stt");
        expect(request[1].headers).toEqual({
            Authorization: "Bearer test-key",
        });
        const form = request[1].body as FormData;
        expect([...form.keys()]).toEqual([
            "language",
            "format",
            "diarize",
            "file",
        ]);
        expect(response.headers.get("x-model-used")).toBe("grok-transcribe");
        expect(response.headers.get("x-usage-prompt-audio-seconds")).toBe(
            "3.25",
        );
        await expect(response.json()).resolves.toMatchObject({
            text: "hello there",
            duration: 3.25,
            segments: [
                { speaker: "0", text: "hello", start: 0, end: 0.5 },
                { speaker: "1", text: "there", start: 0.6, end: 1.1 },
            ],
        });
    });

    it("rejects responses without billable duration", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce(Response.json({ text: "hello" })),
        );

        await expect(
            transcribeWithXai({
                file: new File(["audio"], "audio.wav"),
                apiKey: "test-key",
                log,
            }),
        ).rejects.toMatchObject({ status: 502 });
    });
});
