import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { apikey } from "@shared/db/better-auth.ts";
import {
    createTestApiKey,
    test as workerTest,
} from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import { changeVoiceWithElevenLabs } from "../src/routes/audio.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

afterEach(teardownFetchMock);

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

    it("encodes custom voice IDs at the provider URL boundary", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: {
                    "content-type": "audio/mpeg",
                    "character-cost": "12",
                },
            }),
        );

        await changeVoiceWithElevenLabs({
            audio: createOneSecondWav(),
            voice: "custom/voice?output_format=pcm_44100",
            responseFormat: "mp3",
            apiKey: "test-eleven-key",
            log,
        });

        const requestUrl = String(fetchMock.mock.calls[0][0]);
        expect(requestUrl).toContain(
            "/speech-to-speech/custom%2Fvoice%3Foutput_format%3Dpcm_44100",
        );
        expect(new URL(requestUrl).searchParams.get("output_format")).toBe(
            "mp3_44100_128",
        );
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
        expect(errorLog).toHaveBeenCalledOnce();
    });
});

workerTest(
    "restricts the model to its dedicated endpoint",
    async ({ paidApiKey }) => {
        const formData = new FormData();
        formData.append("model", "eleven-voice-changer");
        formData.append("input", "Not a voice-changing request.");

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
                message: expect.stringContaining("/v1/audio/voice-changer"),
            },
        });
    },
);

workerTest(
    "accepts the source audio as file, like the other audio uploads",
    async ({ paidApiKey }) => {
        const formData = new FormData();
        formData.append("file", createOneSecondWav());
        // An unsupported format fails after the upload is found, before any
        // provider request.
        formData.append("response_format", "flac");

        const response = await fetchGen(
            "https://gen.pollinations.ai/v1/audio/voice-changer",
            {
                method: "POST",
                headers: { Authorization: `Bearer ${paidApiKey}` },
                body: formData,
            },
        );
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                message: expect.stringContaining("response_format must be"),
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

        const response = await fetchGen(
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

workerTest(
    "retries a repeated voice-changer list and bills only the successful attempt",
    async () => {
        const tinybird = createMockTinybird();
        let calls = 0;
        const mocks = createFetchMock({
            tinybird,
            elevenlabs: {
                state: {},
                reset() {},
                handlerMap: {
                    "api.elevenlabs.io": async (request) => {
                        expect(request.url).toContain("/v1/speech-to-speech/");
                        expect(
                            (await request.formData()).get("audio"),
                        ).toBeInstanceOf(File);
                        calls++;
                        if (calls === 1)
                            return new Response("unavailable", { status: 503 });
                        return new Response(new Uint8Array([1, 2, 3]), {
                            headers: {
                                "content-type": "audio/mpeg",
                                "character-cost": "12",
                            },
                        });
                    },
                },
            },
        });
        await mocks.enable("elevenlabs", "tinybird");
        const { key, id, userId } = await createTestApiKey({
            user: { packBalance: 1 },
            allowedModels: ["elevenlabs/eleven-multilingual-sts-v2"],
            pollenBudget: 1,
        });
        const form = new FormData();
        form.set("model", "voice-changer,voice-changer");
        form.set("file", createOneSecondWav());
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/v1/audio/voice-changer", {
                method: "POST",
                headers: { Authorization: `Bearer ${key}` },
                body: form,
            }),
            withInlineGenerationCoordinator({
                ...env,
                ELEVENLABS_API_KEY: "test",
            }),
            ctx,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("x-usage-prompt-audio-seconds")).toBe("1");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(
            new Uint8Array([1, 2, 3]),
        );
        await waitOnExecutionContext(ctx);
        expect(calls).toBe(2);
        expect(tinybird.state.events).toHaveLength(2);
        expect(tinybird.state.events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    modelUsed: "elevenlabs/eleven-multilingual-sts-v2",
                    responseStatus: 503,
                    isBilledUsage: false,
                    isFinal: false,
                }),
                expect.objectContaining({
                    modelUsed: "elevenlabs/eleven-multilingual-sts-v2",
                    modelProviderUsed: "elevenlabs",
                    responseStatus: 200,
                    isBilledUsage: true,
                    isFinal: true,
                    tokenCountPromptAudioSeconds: 1,
                    totalPrice: 0.002,
                }),
            ]),
        );
        const db = drizzle(env.DB);
        expect((await getUserBalance(db, userId)).packBalance).toBeCloseTo(
            1 - 0.002,
            10,
        );
        const [storedKey] = await db
            .select()
            .from(apikey)
            .where(eq(apikey.id, id));
        expect(storedKey.pollenBalance).toBeCloseTo(1 - 0.002, 10);
    },
);
