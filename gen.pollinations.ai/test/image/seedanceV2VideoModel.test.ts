import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callSeedanceV2API } from "../../src/image/models/seedanceV2VideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const VIDEO_URL = "https://video.example.com/seedance.mp4";
const IMAGE_URLS = [
    "https://image.example.com/start.png",
    "https://image.example.com/end.png",
];
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const baseParams: ImageParams = {
    model: "seedance-2.0-mini",
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

describe("Seedance 2.0 Mini and Fast via Replicate", () => {
    it.each([
        ["seedance-2.0-mini", undefined, "720p", 15, 10],
        ["seedance-2.0-mini", "480p", "480p", 4, 4],
        ["seedance-2.0-fast", undefined, "480p", 15, 5],
    ] as const)("routes %s resolution %s as %s and caps duration %s at %s", async (model, resolution, expectedResolution, duration, expectedDuration) => {
        syncImageEnv(
            { REPLICATE_API_TOKEN: "replicate-test-key" } as CloudflareBindings,
            ["REPLICATE_API_TOKEN"],
        );
        const upstreamModel = `bytedance/${model}`;
        const predictionUrl = `https://api.replicate.com/v1/models/${upstreamModel}/predictions`;
        const inputs: Record<string, unknown>[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (IMAGE_URLS.includes(href)) {
                return new Response(PNG_BYTES, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            if (href === predictionUrl) {
                inputs.push(
                    (
                        JSON.parse(init?.body as string) as {
                            input: Record<string, unknown>;
                        }
                    ).input,
                );
                return new Response(
                    JSON.stringify({
                        id: `pred-${model}`,
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

        const result = await callSeedanceV2API("a paper boat", {
            ...baseParams,
            model,
            resolution,
            duration,
        });

        expect(inputs).toEqual([
            {
                prompt: "a paper boat",
                duration: expectedDuration,
                resolution: expectedResolution,
                aspect_ratio: "4:3",
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
                actualModel: model,
                usage: { completionVideoSeconds: 4 },
            },
        });
    });

    it("names the selected variant in aspect-ratio errors", async () => {
        await expect(
            callSeedanceV2API("a paper boat", {
                ...baseParams,
                aspectRatio: "9:21",
            }),
        ).rejects.toThrow("not supported by Seedance 2.0 Mini");
    });

    it("passes reference_images to Replicate when input_references are provided", async () => {
        syncImageEnv(
            { REPLICATE_API_TOKEN: "replicate-test-key" } as CloudflareBindings,
            ["REPLICATE_API_TOKEN"],
        );
        const refUrls = [
            "https://ref.example.com/ref1.png",
            "https://ref.example.com/ref2.png",
        ];
        const inputs: Record<string, unknown>[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (refUrls.includes(href)) {
                return new Response(PNG_BYTES, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            if (
                href ===
                "https://api.replicate.com/v1/models/bytedance/seedance-2.0-mini/predictions"
            ) {
                inputs.push(
                    (
                        JSON.parse(init?.body as string) as {
                            input: Record<string, unknown>;
                        }
                    ).input,
                );
                return new Response(
                    JSON.stringify({
                        id: "pred-ref",
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

        await callSeedanceV2API("a paper boat", {
            ...baseParams,
            image: [],
            input_references: refUrls,
        });

        expect(inputs[0]).toMatchObject({
            reference_images: [
                expect.stringMatching(/^data:image\/png;base64,/),
                expect.stringMatching(/^data:image\/png;base64,/),
            ],
        });
        expect(inputs[0]).not.toHaveProperty("image");
        expect(inputs[0]).not.toHaveProperty("last_frame_image");
    });

    it("rejects when input_references and frame images are both provided", async () => {
        await expect(
            callSeedanceV2API("a paper boat", {
                ...baseParams,
                image: [IMAGE_URLS[0]],
                input_references: ["https://ref.example.com/ref1.png"],
            }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("rejects more than 12 reference images", async () => {
        const tooMany = Array.from(
            { length: 13 },
            (_, i) => `https://ref.example.com/ref${i}.png`,
        );
        await expect(
            callSeedanceV2API("a paper boat", {
                ...baseParams,
                image: [],
                input_references: tooMany,
            }),
        ).rejects.toMatchObject({ status: 400 });
    });
});
