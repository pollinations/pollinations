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
    audio: true,
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
    ] as const)("routes resolution %s as %s with aspect ratio %s", async (resolution, expected, aspectRatio, expectedAspectRatio) => {
        syncImageEnv(
            {
                REPLICATE_API_TOKEN: "replicate-test-key",
            } as CloudflareBindings,
            ["REPLICATE_API_TOKEN"],
        );
        const inputs: Record<string, unknown>[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
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
        });

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
    });

    it("rejects unsupported durations before submitting", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callSeedance25API("a paper boat", {
                ...baseParams,
                duration: 5,
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
