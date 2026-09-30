import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAzureSpeech } from "../src/routes/audio.ts";

describe("Azure TTS", () => {
    afterEach(() => vi.unstubAllGlobals());

    it.each([
        ["openai/tts-1", "tts"],
        ["openai/tts-1-hd", "tts-hd"],
    ] as const)("routes %s to its Azure deployment and bills characters", async (modelName, deployment) => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "audio/mpeg" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await generateAzureSpeech({
            modelName,
            text: "Hi 🌻",
            voice: "alloy",
            responseFormat: "mp3",
            apiKey: "test-key",
        });

        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        expect(request.url).toContain(
            `/deployments/${deployment}/audio/speech`,
        );
        expect(request.headers.get("api-key")).toBe("test-key");
        await expect(request.json()).resolves.toEqual({
            model: modelName.slice("openai/".length),
            input: "Hi 🌻",
            voice: "alloy",
            response_format: "mp3",
        });
        expect(response.headers.get("x-model-used")).toBe(modelName);
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "4",
        );
    });

    it("rejects input beyond Azure's 4096-character limit", async () => {
        await expect(
            generateAzureSpeech({
                modelName: "openai/tts-1",
                text: "a".repeat(4097),
                voice: "alloy",
                responseFormat: "mp3",
                apiKey: "test-key",
            }),
        ).rejects.toMatchObject({ status: 400 });
    });
});
