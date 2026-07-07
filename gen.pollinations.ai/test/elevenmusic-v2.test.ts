import { afterEach, describe, expect, it, vi } from "vitest";
import { generateMusic } from "../src/routes/audio.ts";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
} as never;

describe("ElevenLabs music_v2", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("generates music_v2 audio from a text prompt", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3, 4]), {
                headers: {
                    "content-type": "audio/mpeg",
                    "song-id": "generated-song",
                },
            }),
        );

        const response = await generateMusic({
            prompt: "upbeat synth pop",
            durationSeconds: 12,
            apiKey: "test-eleven-key",
            log,
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("song-id")).toBe("generated-song");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        expect(request.url).toBe("https://api.elevenlabs.io/v1/music");
        await expect(request.json()).resolves.toMatchObject({
            model_id: "music_v2",
            prompt: "upbeat synth pop",
            music_length_ms: 12000,
        });
    });

    it("uploads reference audio and conditions the generated chunk on it", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (input, init) => {
                const request = new Request(input, init);
                if (request.url.endsWith("/v1/music/upload")) {
                    return Response.json({
                        song_id: "reference-song",
                    });
                }
                return new Response(new Uint8Array([1, 2, 3, 4]), {
                    headers: { "content-type": "audio/mpeg" },
                });
            });

        await generateMusic({
            prompt: "[Verse]\nPlay this as warm indie disco",
            durationSeconds: 45,
            referenceAudio: new File(["reference"], "reference.mp3", {
                type: "audio/mpeg",
            }),
            apiKey: "test-eleven-key",
            log,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const uploadRequest = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        expect(uploadRequest.url).toBe(
            "https://api.elevenlabs.io/v1/music/upload",
        );
        expect((await uploadRequest.formData()).get("file")).toBeInstanceOf(
            File,
        );

        const composeRequest = new Request(
            fetchMock.mock.calls[1][0],
            fetchMock.mock.calls[1][1],
        );
        const composeBody = (await composeRequest.json()) as {
            composition_plan: {
                chunks: Array<{
                    conditioning_ref: {
                        song_id: string;
                        range: { start_ms: number; end_ms: number };
                    };
                }>;
            };
        };
        expect(composeBody).toMatchObject({
            model_id: "music_v2",
            composition_plan: {
                chunks: [
                    {
                        text: "[Verse]\nPlay this as warm indie disco",
                        duration_ms: 45000,
                        condition_strength: "high",
                        conditioning_ref: {
                            song_id: "reference-song",
                            range: { start_ms: 0, end_ms: 30000 },
                        },
                    },
                ],
            },
        });
    });

    it("forwards composition_plan for inpainting without a prompt body", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3, 4]), {
                headers: { "content-type": "audio/mpeg" },
            }),
        );
        const compositionPlan = {
            chunks: [
                {
                    song_id: "source-song",
                    range: { start_ms: 0, end_ms: 10000 },
                },
                {
                    text: "[Chorus]\nReplace this with brighter drums",
                    duration_ms: 8000,
                    positive_styles: ["bright drums", "same tempo"],
                    conditioning_ref: {
                        song_id: "source-song",
                        range: { start_ms: 10000, end_ms: 18000 },
                    },
                },
                {
                    song_id: "source-song",
                    range: { start_ms: 18000, end_ms: 30000 },
                },
            ],
        };

        await generateMusic({
            prompt: "unused when composition_plan is provided",
            compositionPlan,
            storeForInpainting: true,
            apiKey: "test-eleven-key",
            log,
        });

        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toEqual({
            model_id: "music_v2",
            composition_plan: compositionPlan,
            store_for_inpainting: true,
        });
        expect(body).not.toHaveProperty("prompt");
    });
});
