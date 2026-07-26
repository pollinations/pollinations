import { env, SELF } from "cloudflare:test";
import { test as workerTest } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changeVoiceWithElevenLabs } from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
} as never;

function createOneSecondWav(): File {
    const sampleRate = 16000;
    const dataSize = sampleRate * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeAscii = (offset: number, value: string) => {
        for (let index = 0; index < value.length; index++) {
            view.setUint8(offset + index, value.charCodeAt(index));
        }
    };
    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(8, "WAVE");
    writeAscii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, "data");
    view.setUint32(40, dataSize, true);
    return new File([buffer], "input.wav", { type: "audio/wav" });
}

describe("ElevenLabs Voice Changer", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("forwards audio to the multilingual speech-to-speech model", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: {
                    "content-type": "audio/mpeg",
                    "character-cost": "12",
                },
            }),
        );

        const response = await changeVoiceWithElevenLabs({
            audio: createOneSecondWav(),
            voice: "nova",
            responseFormat: "mp3",
            apiKey: "test-eleven-key",
            log,
        });

        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        const formData = await request.formData();
        expect(request.url).toContain(
            "/v1/speech-to-speech/MF3mGyEYCl7XYWbV9V6O",
        );
        expect(formData.get("model_id")).toBe("eleven_multilingual_sts_v2");
        expect(formData.get("audio")).toBeInstanceOf(File);
        expect(response.headers.get("x-usage-prompt-audio-seconds")).toBe("1");
    });

    it("fails closed when provider metering is missing", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "audio/mpeg" },
            }),
        );

        await expect(
            changeVoiceWithElevenLabs({
                audio: createOneSecondWav(),
                voice: "nova",
                responseFormat: "mp3",
                apiKey: "test-eleven-key",
                log,
            }),
        ).rejects.toMatchObject({ status: 502 });
    });
});

workerTest(
    "restricts the model to its dedicated endpoint",
    async ({ paidApiKey }) => {
        const formData = new FormData();
        formData.append("model", "eleven-voice-changer");
        formData.append("input", "Not a voice-changing request.");

        const response = await SELF.fetch(
            "https://gen.pollinations.ai/v1/audio/speech",
            {
                method: "POST",
                headers: { Authorization: `Bearer ${paidApiKey}` },
                body: formData,
            },
        );
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                message: expect.stringContaining("/v1/audio/voice-changer"),
            },
        });
    },
);

workerTest.runIf(Boolean(env.ELEVENLABS_API_KEY))(
    "transforms audio through the full local route",
    async ({ paidApiKey }) => {
        const formData = new FormData();
        formData.append("model", "voice-changer");
        formData.append("audio", createOneSecondWav());
        formData.append("voice", "nova");
        formData.append("response_format", "mp3");

        const response = await SELF.fetch(
            "https://gen.pollinations.ai/v1/audio/voice-changer",
            {
                method: "POST",
                headers: { Authorization: `Bearer ${paidApiKey}` },
                body: formData,
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("audio/mpeg");
        expect(response.headers.get("x-usage-prompt-audio-seconds")).toBe("1");
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    },
);
