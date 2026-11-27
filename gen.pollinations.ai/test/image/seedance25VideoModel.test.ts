import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callSeedance25API } from "../../src/image/models/seedance25VideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const PREDICTIONS_URL =
    "https://api.replicate.com/v1/models/bytedance/seedance-2.5/predictions";
const VIDEO_URL = "https://video.example.com/seedance-2.5.mp4";
const IMAGE_URLS = [
    "https://image.example.com/start.png",
    "https://image.example.com/end.png",
];
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const REFERENCE_MEDIA = {
    reference_images: ["https://media.example/reference,a.png"],
    reference_videos: ["https://media.example/motion.mp4"],
    reference_audios: ["https://media.example/voice.mp3"],
};

const baseParams: ImageParams = {
    model: "bytedance/seedance-2.5",
    width: 1024,
    height: 768,
    dimensionsExplicit: false,
    seed: 42,
    safe: false,
    quality: "medium",
    image: IMAGE_URLS,
    transparent: false,
    reasoning: "balanced",
    audio: undefined, // Omitted by the caller: Seedance keeps its audio on.
    duration: 4,
    aspectRatio: "4:3",
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Seedance 2.5 via Replicate", () => {
    it.each([
        [undefined, "480p", undefined, "16:9"],
        ["720p", "720p", "4:3", "4:3"],
        // Without a reference video, adaptive keeps the fixed duration.
        [undefined, "480p", "adaptive", "adaptive"],
    ] as const)(
        "routes resolution %s as %s with aspect ratio %s",
        async (resolution, expected, aspectRatio, expectedAspectRatio) => {
            syncImageEnv(
                {
                    REPLICATE_API_TOKEN: "replicate-test-key",
                } as CloudflareBindings,
                ["REPLICATE_API_TOKEN"],
            );
            const inputs: Record<string, unknown>[] = [];
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async (url, init) => {
                    const href = typeof url === "string" ? url : url.toString();
                    if (IMAGE_URLS.includes(href)) {
                        return new Response(PNG_BYTES, {
                            headers: { "Content-Type": "image/png" },
                        });
                    }
                    if (href === PREDICTIONS_URL) {
                        inputs.push(
                            (
                                JSON.parse(init?.body as string) as {
                                    input: Record<string, unknown>;
                                }
                            ).input,
                        );
                        return new Response(
                            JSON.stringify({
                                id: "pred-seedance-25",
                                status: "succeeded",
                                output: VIDEO_URL,
                                metrics: { video_output_duration_seconds: 4 },
                            }),
                            { status: 201 },
                        );
                    }
                    if (href === VIDEO_URL) {
                        return new Response(new Uint8Array([0, 0, 0, 24]), {
                            headers: { "Content-Type": "video/mp4" },
                        });
                    }
                    return new Response("unexpected URL", { status: 404 });
                },
            );

            const result = await callSeedance25API("a paper boat", {
                ...baseParams,
                resolution,
                aspectRatio,
            });

            expect(inputs).toEqual([
                {
                    prompt: "a paper boat",
                    duration: 4,
                    resolution: expected,
                    aspect_ratio: expectedAspectRatio,
                    generate_audio: true,
                    seed: 42,
                    image: expect.stringMatching(/^data:image\/png;base64,/),
                    last_frame_image: expect.stringMatching(
                        /^data:image\/png;base64,/,
                    ),
                },
            ]);
            expect(result).toMatchObject({
                mimeType: "video/mp4",
                durationSeconds: 4,
                trackingData: {
                    actualModel: "bytedance/seedance-2.5",
                    usage: { completionVideoSeconds: 4 },
                },
            });
        },
    );

    it("forwards all reference media URLs directly to Replicate", async () => {
        syncImageEnv(
            { REPLICATE_API_TOKEN: "replicate-test-key" } as CloudflareBindings,
            ["REPLICATE_API_TOKEN"],
        );
        const inputs: Record<string, unknown>[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href === PREDICTIONS_URL) {
                inputs.push(
                    (
                        JSON.parse(init?.body as string) as {
                            input: Record<string, unknown>;
                        }
                    ).input,
                );
                return new Response(
                    JSON.stringify({
                        id: "pred",
                        status: "succeeded",
                        output: VIDEO_URL,
                    }),
                    { status: 201 },
                );
            }
            if (href === VIDEO_URL) {
                return new Response(new Uint8Array([0, 0, 0, 24]), {
                    headers: { "Content-Type": "video/mp4" },
                });
            }
            return new Response("reference media must not be downloaded", {
                status: 500,
            });
        });

        await callSeedance25API("reference-driven clip", {
            ...baseParams,
            image: [],
            ...REFERENCE_MEDIA,
        });

        expect(inputs[0]).toMatchObject(REFERENCE_MEDIA);
    });

    it.each([
        ["adaptive", { video_output_duration_seconds: 9 }, 9, -1, "adaptive"],
        ["adaptive", {}, undefined, -1, "adaptive"],
        // Unset ratio defaults to an edit; an explicit ratio stays fixed.
        [undefined, { video_output_duration_seconds: 9 }, 9, -1, "adaptive"],
        ["16:9", { video_output_duration_seconds: 4 }, 4, 4, "16:9"],
    ] as const)(
        "with reference video and aspect ratio %s bills reported duration (metrics %j)",
        async (aspectRatio, metrics, billedSeconds, expectedDuration, expectedAspectRatio) => {
            syncImageEnv(
                {
                    REPLICATE_API_TOKEN: "replicate-test-key",
                } as CloudflareBindings,
                ["REPLICATE_API_TOKEN"],
            );
            const inputs: Record<string, unknown>[] = [];
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async (url, init) => {
                    const href = typeof url === "string" ? url : url.toString();
                    if (href === PREDICTIONS_URL) {
                        inputs.push(
                            (
                                JSON.parse(init?.body as string) as {
                                    input: Record<string, unknown>;
                                }
                            ).input,
                        );
                        return new Response(
                            JSON.stringify({
                                id: "pred-edit",
                                status: "succeeded",
                                output: VIDEO_URL,
                                metrics,
                            }),
                            { status: 201 },
                        );
                    }
                    return new Response(new Uint8Array([0, 0, 0, 24]), {
                        headers: { "Content-Type": "video/mp4" },
                    });
                },
            );

            const result = callSeedance25API("replace the background", {
                ...baseParams,
                image: [],
                aspectRatio,
                reference_videos: REFERENCE_MEDIA.reference_videos,
            });

            if (billedSeconds === undefined) {
                await expect(result).rejects.toMatchObject({ status: 502 });
            } else {
                await expect(result).resolves.toMatchObject({
                    durationSeconds: billedSeconds,
                    trackingData: {
                        usage: { completionVideoSeconds: billedSeconds },
                    },
                });
            }
            expect(inputs[0]).toMatchObject({
                duration: expectedDuration,
                aspect_ratio: expectedAspectRatio,
            });
        },
    );
});
