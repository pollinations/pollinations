import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncImageEnvironment } from "../../src/image/handler.ts";
import {
    callPrunaImageAPI,
    callPrunaImageEditAPI,
    callPrunaVideo720API,
    callPrunaVideo1080API,
} from "../../src/image/models/prunaModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

interface ProviderRequest {
    url: string;
    body: Record<string, unknown>;
}

// PNG magic bytes — returned for any non-API fetch (user images + output
// delivery) so the real download→data-URI path runs and detectMimeType
// resolves to image/png.
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

// Records DeepInfra and Replicate API calls; user-image and provider-output
// downloads return minimal image bytes.
function mockPrunaFetch(
    requests: ProviderRequest[],
    metrics: Record<string, number> = { predict_time: 1 },
) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            let hostname = "";
            try {
                hostname = new URL(href).hostname;
            } catch {
                hostname = "";
            }
            if (
                hostname !== "api.deepinfra.com" &&
                hostname !== "api.replicate.com"
            ) {
                return new Response(PNG_BYTES, { status: 200 });
            }
            const body = init?.body
                ? (JSON.parse(init.body as string) as Record<string, unknown>)
                : {};
            requests.push({ url: href, body });
            if (hostname === "api.deepinfra.com") {
                return new Response(
                    JSON.stringify({
                        images: ["data:image/png;base64,iVBORw0KGgo="],
                        inference_status: {
                            cost: href.endsWith("/PrunaAI/p-image-Edit")
                                ? 0.01
                                : 0.005,
                            runtime_ms: 1000,
                        },
                    }),
                    { status: 200 },
                );
            }
            return new Response(
                JSON.stringify({
                    id: "pred_pruna_test",
                    status: "succeeded",
                    output: "https://replicate.delivery/x/pruna-output.jpeg",
                    metrics,
                }),
                { status: 201 },
            );
        });
}

const baseParams: ImageParams = {
    model: "p-image",
    width: 1024,
    height: 1024,
    dimensionsExplicit: false,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: false,
    duration: 0,
};

const inputOf = (req: ProviderRequest) =>
    new URL(req.url).hostname === "api.replicate.com"
        ? (req.body as { input: Record<string, unknown> }).input
        : req.body;

const DATA_URI = /^data:[^;]+;base64,/;

beforeEach(() => {
    syncImageEnvironment({
        ...env,
        DEEPINFRA_API_KEY: "test-deepinfra-key",
        REPLICATE_API_TOKEN: "r8_test_token",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("prunaModel - p-image", () => {
    it("posts to prunaai/p-image with custom dimensions", async () => {
        const requests: ProviderRequest[] = [];
        mockPrunaFetch(requests);

        const result = await callPrunaImageAPI("a red apple", baseParams);

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe(
            "https://api.deepinfra.com/v1/inference/PrunaAI/p-image",
        );
        const input = inputOf(requests[0]);
        expect(input.prompt).toBe("a red apple");
        expect(input.aspect_ratio).toBe("custom");
        expect(input.width).toBe(1024);
        expect(input.height).toBe(1024);
        expect(input.seed).toBe(42);
        expect(result.trackingData?.actualModel).toBe("p-image");
    });
});

describe("prunaModel - p-image-edit", () => {
    it("rejects a request with no input image (400)", async () => {
        mockPrunaFetch([]);

        await expect(
            callPrunaImageEditAPI("make it green", {
                ...baseParams,
                image: [],
            }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("rejects more than five input images (400)", async () => {
        mockPrunaFetch([]);

        await expect(
            callPrunaImageEditAPI("make it green", {
                ...baseParams,
                image: Array.from(
                    { length: 6 },
                    (_, i) => `https://example.com/${i}.jpg`,
                ),
            }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("posts image references to PrunaAI/p-image-Edit", async () => {
        const requests: ProviderRequest[] = [];
        mockPrunaFetch(requests);

        const result = await callPrunaImageEditAPI("make it green", {
            ...baseParams,
            image: ["https://example.com/apple.jpg"],
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe(
            "https://api.deepinfra.com/v1/inference/PrunaAI/p-image-Edit",
        );
        const input = inputOf(requests[0]);
        expect(input.prompt).toBe("make it green");
        const images = input.images as string[];
        expect(images).toHaveLength(1);
        expect(images[0]).toBe("https://example.com/apple.jpg");
        expect(result.trackingData?.actualModel).toBe("p-image-edit");
    });
});

describe("prunaModel - p-video", () => {
    it("posts a text-to-video request and bills the reported output duration", async () => {
        const requests: ProviderRequest[] = [];
        // Request 8s but Replicate reports a 5s output — billing must follow
        // the reported metric, not the request.
        mockPrunaFetch(requests, {
            predict_time: 6,
            video_output_duration_seconds: 5,
        });

        const result = await callPrunaVideo720API("a butterfly on a flower", {
            ...baseParams,
            width: 1280,
            height: 720,
            duration: 8,
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe(
            "https://api.replicate.com/v1/models/prunaai/p-video/predictions",
        );
        const input = inputOf(requests[0]);
        expect(input.prompt).toBe("a butterfly on a flower");
        expect(input.resolution).toBe("720p");
        expect(input.aspect_ratio).toBe("16:9");
        expect(input.duration).toBe(8);
        expect(input.image).toBeUndefined();
        expect(result.mimeType).toBe("video/mp4");
        expect(result.durationSeconds).toBe(5);
        expect(result.trackingData?.actualModel).toBe("p-video-720p");
        expect(result.trackingData?.usage?.completionVideoSeconds).toBe(5);
    });

    it("locks resolution to 1080p and tags the 1080p model", async () => {
        const requests: ProviderRequest[] = [];
        mockPrunaFetch(requests, {
            predict_time: 8,
            video_output_duration_seconds: 5,
        });

        // height=720 must NOT downgrade the 1080p model — resolution is locked.
        const result = await callPrunaVideo1080API("a butterfly on a flower", {
            ...baseParams,
            width: 1280,
            height: 720,
            duration: 5,
        });

        const input = inputOf(requests[0]);
        expect(input.resolution).toBe("1080p");
        expect(result.trackingData?.actualModel).toBe("p-video-1080p");
        expect(result.trackingData?.usage?.completionVideoSeconds).toBe(5);
    });

    it("uses the input image (data URI) for image-to-video", async () => {
        const requests: ProviderRequest[] = [];
        mockPrunaFetch(requests);

        await callPrunaVideo720API("animate this", {
            ...baseParams,
            image: ["https://example.com/frame.jpg"],
        });

        const input = inputOf(requests[0]);
        expect(input.image).toMatch(DATA_URI);
        // I2V derives dimensions from the image — no aspect_ratio sent.
        expect(input.aspect_ratio).toBeUndefined();
    });
});
