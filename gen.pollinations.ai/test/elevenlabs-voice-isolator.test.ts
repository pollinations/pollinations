import { createExecutionContext, env } from "cloudflare:test";
import { test as workerTest } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import { isolateVoiceWithElevenLabs } from "../src/routes/audio.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

const errorLog = vi.fn();
const log = {
    error: errorLog,
    info: vi.fn(),
    warn: vi.fn(),
} as never;

async function fetchGen(input: RequestInfo | URL, init?: RequestInit) {
    return worker.fetch(
        new Request(input, init),
        withInlineGenerationCoordinator(env),
        createExecutionContext(),
    );
}

function createWav(seconds: number): File {
    const sampleRate = 16000;
    const dataSize = sampleRate * 2 * seconds;
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

describe("ElevenLabs Voice Isolator", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("forwards media and bills provider-metered input duration", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: {
                    "content-type": "audio/mpeg",
                    "character-cost": "60",
                },
            }),
        );

        const response = await isolateVoiceWithElevenLabs({
            audio: createWav(5),
            apiKey: "test-eleven-key",
            log,
        });

        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        const formData = await request.formData();
        expect(request.url).toBe(
            "https://api.elevenlabs.io/v1/audio-isolation",
        );
        expect(formData.get("audio")).toBeInstanceOf(File);
        expect(response.headers.get("x-usage-prompt-audio-seconds")).toBe("5");
    });

    it("accepts video input", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: {
                    "content-type": "audio/mpeg",
                    "character-cost": "60",
                },
            }),
        );

        const response = await isolateVoiceWithElevenLabs({
            audio: new File([new Uint8Array([1, 2, 3])], "input.mp4", {
                type: "video/mp4",
            }),
            apiKey: "test-eleven-key",
            log,
        });

        expect(response.status).toBe(200);
    });

    it("fails closed when provider metering is missing", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "audio/mpeg" },
            }),
        );

        await expect(
            isolateVoiceWithElevenLabs({
                audio: createWav(5),
                apiKey: "test-eleven-key",
                log,
            }),
        ).rejects.toMatchObject({ status: 502 });
        expect(errorLog).toHaveBeenCalledOnce();
    });
});

workerTest(
    "restricts the model to its dedicated endpoint",
    async ({ paidApiKey }) => {
        const formData = new FormData();
        formData.append("model", "eleven-voice-isolator");
        formData.append("input", "Not an isolation request.");

        const response = await fetchGen(
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
                message: expect.stringContaining("/v1/audio/voice-isolator"),
            },
        });
    },
);

workerTest.runIf(Boolean(env.ELEVENLABS_API_KEY))(
    "isolates speech through the full local route",
    async ({ paidApiKey }) => {
        const formData = new FormData();
        formData.append("model", "voice-isolator");
        formData.append("audio", createWav(5));

        const response = await fetchGen(
            "https://gen.pollinations.ai/v1/audio/voice-isolator",
            {
                method: "POST",
                headers: { Authorization: `Bearer ${paidApiKey}` },
                body: formData,
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("audio/mpeg");
        expect(response.headers.get("x-usage-prompt-audio-seconds")).toBe("5");
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    },
);
