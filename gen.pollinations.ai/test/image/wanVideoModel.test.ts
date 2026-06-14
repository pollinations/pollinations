import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callWanAPI,
    callWanFastAPI,
    callWanPro1080pAPI,
    callWanProAPI,
} from "../../src/image/models/wanVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const REPLICATE_PREDICTIONS =
    /^https:\/\/api\.replicate\.com\/v1\/models\/(.+)\/predictions$/;
const VIDEO_URL = "https://video.example.com/wan-output.mp4";
const INPUT_IMAGE_URL = "https://img.example.com/first-frame.png";
// PNG magic bytes so downloadUserImage's detectMimeType resolves to image/png.
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const EXPECTED_DATA_URI = /^data:image\/png;base64,/;

interface ReplicateCall {
    model: string;
    input: Record<string, unknown>;
}

const baseParams: ImageParams = {
    model: "wan-pro",
    width: 1280,
    height: 720,
    dimensionsExplicit: false,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: true,
    duration: 5,
};

/**
 * Mock the Replicate predictions endpoint (Prefer: wait returns a terminal
 * status inline, so no polling). Captures each call's model slug + input.
 * `metricsDuration` is echoed as the reported output length; pass undefined to
 * exercise the requested-duration fallback (per-video models like wan-fast).
 */
function mockReplicateFetch(
    calls: ReplicateCall[],
    metricsDuration: number | undefined = 5,
) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            const m = href.match(REPLICATE_PREDICTIONS);
            if (m) {
                const body = JSON.parse(init?.body as string) as {
                    input: Record<string, unknown>;
                };
                calls.push({ model: m[1], input: body.input });
                return new Response(
                    JSON.stringify({
                        id: "pred-wan-test",
                        status: "succeeded",
                        output: VIDEO_URL,
                        metrics:
                            metricsDuration === undefined
                                ? {}
                                : {
                                      video_output_duration_seconds:
                                          metricsDuration,
                                  },
                    }),
                    { status: 200 },
                );
            }
            if (href === VIDEO_URL) {
                return new Response(new Uint8Array([0, 0, 0, 24]), {
                    status: 200,
                    headers: { "Content-Type": "video/mp4" },
                });
            }
            if (href === INPUT_IMAGE_URL) {
                return new Response(PNG_BYTES, {
                    status: 200,
                    headers: { "Content-Type": "image/png" },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });
}

function setReplicateEnv() {
    syncImageEnv(
        { REPLICATE_API_TOKEN: "replicate-test-key" } as CloudflareBindings,
        ["REPLICATE_API_TOKEN"],
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("wanVideoModel billing usage", () => {
    it("bills video seconds only (audio bundled) for wan-pro at locked 720p", async () => {
        setReplicateEnv();
        const calls: ReplicateCall[] = [];
        mockReplicateFetch(calls, 5);

        const result = await callWanProAPI(
            "a calm ocean at sunrise",
            baseParams,
        );

        expect(calls).toHaveLength(1);
        expect(calls[0].model).toBe("wan-video/wan-2.7-t2v");
        expect(calls[0].input.resolution).toBe("720p");
        expect(result.mimeType).toBe("video/mp4");
        // No separate completionAudioSeconds — audio is bundled into the rate.
        expect(result.trackingData).toEqual({
            actualModel: "wan-pro",
            usage: { completionVideoSeconds: 5 },
        });
    });

    it("wan-pro-1080p locks to 1080p and bills as wan-pro-1080p", async () => {
        setReplicateEnv();
        const calls: ReplicateCall[] = [];
        mockReplicateFetch(calls, 5);

        const result = await callWanPro1080pAPI("a calm ocean at sunrise", {
            ...baseParams,
            model: "wan-pro-1080p",
        });

        expect(calls[0].model).toBe("wan-video/wan-2.7-t2v");
        expect(calls[0].input.resolution).toBe("1080p");
        expect(result.trackingData).toEqual({
            actualModel: "wan-pro-1080p",
            usage: { completionVideoSeconds: 5 },
        });
    });

    it("bills video seconds only for wan and snaps duration to the 2.6 enum", async () => {
        setReplicateEnv();
        const calls: ReplicateCall[] = [];
        mockReplicateFetch(calls, 5);

        const result = await callWanAPI("a calm ocean at sunrise", {
            ...baseParams,
            model: "wan",
            duration: 3, // snaps to nearest allowed (5)
        });

        expect(calls[0].model).toBe("wan-video/wan-2.6-t2v");
        // Landscape dims -> 720p landscape size; duration snapped to 5.
        expect(calls[0].input.size).toBe("1280*720");
        expect(calls[0].input.duration).toBe(5);
        expect(result.trackingData).toEqual({
            actualModel: "wan",
            usage: { completionVideoSeconds: 5 },
        });
    });

    it("bills a flat 5s for wan-fast at locked 480p, even without a duration metric", async () => {
        setReplicateEnv();
        const calls: ReplicateCall[] = [];
        mockReplicateFetch(calls, undefined); // per-video model reports no metric

        const result = await callWanFastAPI("a calm ocean at sunrise", {
            ...baseParams,
            model: "wan-fast",
        });

        expect(calls[0].model).toBe("wan-video/wan-2.2-t2v-fast");
        expect(calls[0].input.resolution).toBe("480p");
        expect(result.trackingData).toEqual({
            actualModel: "wan-fast",
            usage: { completionVideoSeconds: 5 },
        });
    });
});

describe("wanVideoModel image-to-video routing", () => {
    it("wan-pro i2v routes to wan-2.7-i2v and sends first_frame", async () => {
        setReplicateEnv();
        const calls: ReplicateCall[] = [];
        mockReplicateFetch(calls, 5);

        await callWanProAPI("a cat walking", {
            ...baseParams,
            image: [INPUT_IMAGE_URL],
        });

        expect(calls[0].model).toBe("wan-video/wan-2.7-i2v");
        expect(calls[0].input.resolution).toBe("720p");
        expect(calls[0].input.first_frame as string).toMatch(EXPECTED_DATA_URI);
    });

    it("wan-fast i2v routes to wan-2.2-i2v-fast and sends image", async () => {
        setReplicateEnv();
        const calls: ReplicateCall[] = [];
        mockReplicateFetch(calls, undefined);

        await callWanFastAPI("a cat walking", {
            ...baseParams,
            model: "wan-fast",
            image: [INPUT_IMAGE_URL],
        });

        expect(calls[0].model).toBe("wan-video/wan-2.2-i2v-fast");
        expect(calls[0].input.resolution).toBe("480p");
        expect(calls[0].input.image as string).toMatch(EXPECTED_DATA_URI);
    });
});
