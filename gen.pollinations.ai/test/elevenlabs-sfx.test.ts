import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSoundEffect } from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
} as never;

describe("ElevenLabs sound effects", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("posts prompt, duration, loop and prompt_influence to /v1/sound-generation", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array(16000), {
                headers: {
                    "content-type": "audio/mpeg",
                    "character-cost": "60",
                },
            }),
        );

        const response = await generateSoundEffect({
            prompt: "distant thunder rolling",
            durationSeconds: 5,
            loop: true,
            promptInfluence: 0.7,
            apiKey: "test-eleven-key",
            log,
        });

        expect(response.status).toBe(200);
        // 60 metered credits / 12 per second = 5 billed seconds.
        expect(response.headers.get("x-usage-completion-audio-seconds")).toBe(
            "5",
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        expect(request.url).toBe(
            "https://api.elevenlabs.io/v1/sound-generation",
        );
        await expect(request.json()).resolves.toMatchObject({
            model_id: "eleven_text_to_sound_v2",
            text: "distant thunder rolling",
            duration_seconds: 5,
            loop: true,
            prompt_influence: 0.7,
        });
    });

    it("clamps duration into the 0.5-30s ElevenLabs range", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array(16000), {
                headers: {
                    "content-type": "audio/mpeg",
                    "character-cost": "60",
                },
            }),
        );

        await generateSoundEffect({
            prompt: "tick",
            durationSeconds: 120,
            apiKey: "test-eleven-key",
            log,
        });

        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        await expect(request.json()).resolves.toMatchObject({
            duration_seconds: 30,
        });
    });

    it("rejects non-mp3 response_format instead of silently downgrading", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");

        await expect(
            generateSoundEffect({
                prompt: "ocean waves",
                responseFormat: "wav",
                apiKey: "test-eleven-key",
                log,
            }),
        ).rejects.toMatchObject({ status: 400 });

        // Must reject before hitting ElevenLabs (no spurious billed generation).
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a response without ElevenLabs metering", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array(16000), {
                headers: { "content-type": "audio/mpeg" },
            }),
        );

        await expect(
            generateSoundEffect({
                prompt: "door creak",
                apiKey: "test-eleven-key",
                log: { info: vi.fn(), error: vi.fn() } as never,
            }),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("allows the default mp3 response_format", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array(16000), {
                headers: {
                    "content-type": "audio/mpeg",
                    "character-cost": "60",
                },
            }),
        );

        const response = await generateSoundEffect({
            prompt: "camera shutter",
            responseFormat: "mp3",
            apiKey: "test-eleven-key",
            log,
        });

        expect(response.status).toBe(200);
    });
});
