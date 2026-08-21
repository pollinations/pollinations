import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeWithAzure } from "../src/routes/audio.ts";

describe("transcribeWithAzure", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("forwards OpenAI transcription options and bills provider duration", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            Response.json({
                text: "hello from Azure",
                usage: { type: "duration", seconds: 60 },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await transcribeWithAzure({
            file: new File(["audio"], "audio.wav", { type: "audio/wav" }),
            language: "en",
            prompt: "Pollinations",
            responseFormat: "json",
            temperature: 0.2,
            apiKey: "test-key",
        });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(
            "https://myceli-prod-swedencentral.openai.azure.com/openai/deployments/test-gpt-transcribe/audio/transcriptions?api-version=2025-04-01-preview",
        );
        expect(init.headers).toEqual({ "api-key": "test-key" });
        const form = init.body as FormData;
        expect(form.get("model")).toBe("gpt-transcribe");
        expect(form.get("language")).toBe("en");
        expect(form.get("prompt")).toBe("Pollinations");
        expect(form.get("response_format")).toBe("json");
        expect(form.get("temperature")).toBe("0.2");
        expect(form.get("file")).toBeInstanceOf(File);

        expect(response.headers.get("x-model-used")).toBe("gpt-transcribe");
        expect(response.headers.get("x-usage-prompt-audio-seconds")).toBe("60");
        await expect(response.json()).resolves.toEqual({
            text: "hello from Azure",
            usage: { type: "duration", seconds: 60 },
        });
    });

    it("rejects unsupported response formats before calling Azure", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            transcribeWithAzure({
                file: new File(["audio"], "audio.wav"),
                responseFormat: "verbose_json",
                apiKey: "test-key",
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fails closed when Azure omits duration metering", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce(
                Response.json({
                    text: "hello",
                    usage: { type: "duration" },
                }),
            ),
        );

        await expect(
            transcribeWithAzure({
                file: new File(["audio"], "audio.wav"),
                apiKey: "test-key",
            }),
        ).rejects.toMatchObject({ status: 502 });
    });
});
