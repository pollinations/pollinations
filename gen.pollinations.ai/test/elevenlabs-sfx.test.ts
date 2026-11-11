import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withModelFallbackResponse } from "../src/fallback.ts";
import { getGenerationModelRegistry } from "../src/model-registry.ts";
import { generateSoundEffect } from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
} as never;

describe("ElevenLabs sound effects", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("falls back to fal and bills its reported units instead of the requested duration", async () => {
        vi.useFakeTimers();
        const registry = await getGenerationModelRegistry(env);
        const entry = registry.resolve("elevenlabs/eleven-text-to-sound-v3");
        if (!entry) throw new Error("Missing SFX v3 registry entry");
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({ detail: "Busy" }, { status: 503 }),
            )
            .mockResolvedValueOnce(
                Response.json({
                    status_url: "https://queue.fal.run/status",
                    response_url: "https://queue.fal.run/result",
                }),
            )
            .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
            .mockResolvedValueOnce(
                Response.json(
                    { audio: { url: "https://fal.media/sfx.mp3" } },
                    { headers: { "x-fal-billable-units": "2" } },
                ),
            )
            .mockResolvedValueOnce(new Response("ID3audio"));
        const pending = withModelFallbackResponse(
            {
                resolved: entry.id,
                definition: entry.definition,
                fallbackEntries: entry.fallbackEntries,
            },
            (candidate) =>
                generateSoundEffect({
                    modelName: candidate.id as
                        | "elevenlabs/eleven-text-to-sound-v3"
                        | "elevenlabs/eleven-text-to-sound-v3:fal",
                    prompt: "a door closes",
                    durationSeconds: 1,
                    loop: true,
                    promptInfluence: 0.7,
                    apiKey: "test-eleven",
                    falKey: "test-fal",
                    log,
                }),
        );
        await vi.advanceTimersByTimeAsync(5000);
        const response = await pending;
        expect(await response.text()).toBe("ID3audio");
        expect(response.headers.get("x-model-used")).toBe(
            "elevenlabs/eleven-text-to-sound-v3:fal",
        );
        expect(response.headers.get("x-usage-completion-audio-seconds")).toBe(
            "2",
        );
        const request = new Request(...fetchSpy.mock.calls[1]);
        expect(request.url).toBe(
            "https://queue.fal.run/elevenlabs/sound-effects/v3",
        );
        await expect(request.json()).resolves.toEqual({
            text: "a door closes",
            duration_seconds: 1,
            loop: true,
            prompt_influence: 0.7,
        });
    });

    it.each([
        ["elevenlabs/eleven-text-to-sound-v2", "eleven_text_to_sound_v2"],
        ["elevenlabs/eleven-text-to-sound-v3", "eleven_text_to_sound_v3"],
    ] as const)(
        "routes %s with metered usage and sound controls",
        async (modelName, upstreamModel) => {
            const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
                new Response(new Uint8Array(16000), {
                    headers: {
                        "content-type": "audio/mpeg",
                        "character-cost": "60",
                    },
                }),
            );

            const response = await generateSoundEffect({
                modelName,
                prompt: "distant thunder rolling",
                durationSeconds: 5,
                loop: true,
                promptInfluence: 0.7,
                apiKey: "test-eleven-key",
                log,
            });

            expect(response.status).toBe(200);
            // 60 metered credits / 12 per second = 5 billed seconds.
            expect(
                response.headers.get("x-usage-completion-audio-seconds"),
            ).toBe("5");

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const request = new Request(
                fetchMock.mock.calls[0][0],
                fetchMock.mock.calls[0][1],
            );
            expect(request.url).toBe(
                "https://api.elevenlabs.io/v1/sound-generation",
            );
            await expect(request.json()).resolves.toMatchObject({
                model_id: upstreamModel,
                text: "distant thunder rolling",
                duration_seconds: 5,
                loop: true,
                prompt_influence: 0.7,
            });
        },
    );

    it.each([
        [30, "361", "30"],
        [undefined, "60", "5"],
    ] as const)(
        "bills v3 duration %s without converting rounded quota credits",
        async (durationSeconds, credits, expectedSeconds) => {
            vi.spyOn(globalThis, "fetch").mockResolvedValue(
                new Response("ID3audio", {
                    headers: {
                        "content-type": "audio/mpeg",
                        "character-cost": credits,
                    },
                }),
            );
            const response = await generateSoundEffect({
                modelName: "elevenlabs/eleven-text-to-sound-v3",
                prompt: "ocean waves",
                durationSeconds,
                apiKey: "test-key",
                log,
            });
            expect(
                response.headers.get("x-usage-completion-audio-seconds"),
            ).toBe(expectedSeconds);
        },
    );

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
