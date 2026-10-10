import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callKandinskyFalVideoAPI } from "../../src/image/models/kandinskyFalVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const LITE_TEXT_ENDPOINT =
    "https://queue.fal.run/fal-ai/kandinsky6-lite/text-to-video";
const LITE_IMAGE_ENDPOINT =
    "https://queue.fal.run/fal-ai/kandinsky6-lite/image-to-video";
const PRO_TEXT_ENDPOINT =
    "https://queue.fal.run/fal-ai/kandinsky6-pro/text-to-video";
const PRO_IMAGE_ENDPOINT =
    "https://queue.fal.run/fal-ai/kandinsky6-pro/image-to-video";
const STATUS_URL =
    "https://queue.fal.run/fal-ai/kandinsky6/requests/test/status";
const RESULT_URL = "https://queue.fal.run/fal-ai/kandinsky6/requests/test";
const VIDEO_URL = "https://fal.media/kandinsky-test.mp4";
const VIDEO_BYTES = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]);

const baseParams: ImageParams = {
    model: "kandinsky/kandinsky-6-lite",
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
    aspectRatio: "16:9",
};

type ProviderRequest = {
    url: string;
    body?: Record<string, unknown>;
};

function mockFalFetch(
    requests: ProviderRequest[],
    status: "COMPLETED" | "FAILED" = "COMPLETED",
) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            requests.push({
                url: href,
                body: init?.body
                    ? (JSON.parse(init.body as string) as Record<
                          string,
                          unknown
                      >)
                    : undefined,
            });
            if (
                href === LITE_TEXT_ENDPOINT ||
                href === LITE_IMAGE_ENDPOINT ||
                href === PRO_TEXT_ENDPOINT ||
                href === PRO_IMAGE_ENDPOINT
            ) {
                return Response.json({
                    status_url: STATUS_URL,
                    response_url: RESULT_URL,
                });
            }
            if (href === STATUS_URL) {
                return Response.json({
                    status,
                    error: "provider rejected generation",
                });
            }
            if (href === RESULT_URL) {
                return Response.json({
                    video: { url: VIDEO_URL, content_type: "video/mp4" },
                });
            }
            if (href === VIDEO_URL) {
                return new Response(VIDEO_BYTES, {
                    headers: { "Content-Type": "video/mp4" },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });
}

beforeEach(() => {
    syncImageEnv({ FAL_KEY: "test-fal-key" } as CloudflareBindings, [
        "FAL_KEY",
    ]);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("Kandinsky 6.0 Fal Video Model", () => {
    it("routes Lite text-to-video correctly", async () => {
        const requests: ProviderRequest[] = [];
        mockFalFetch(requests);

        const result = await callKandinskyFalVideoAPI(
            "a cat playing a drum solo",
            baseParams,
        );

        expect(result.durationSeconds).toBe(5);
        expect(result.mimeType).toBe("video/mp4");
        expect(result.trackingData).toEqual({
            actualModel: "kandinsky/kandinsky-6-lite",
            usage: { completionVideoSeconds: 5 },
        });

        const submission = requests.find((r) => r.url === LITE_TEXT_ENDPOINT);
        expect(submission).toBeDefined();
        expect(submission?.body).toMatchObject({
            prompt: "a cat playing a drum solo",
            aspect_ratio: "16:9",
            generate_audio: true,
            seed: 42,
        });
    });

    it("routes Lite image-to-video with auto aspect ratio and image_url", async () => {
        const requests: ProviderRequest[] = [];
        mockFalFetch(requests);

        const startImage = "https://media.pollinations.ai/start-frame.png";
        const result = await callKandinskyFalVideoAPI("animate this artwork", {
            ...baseParams,
            image: [startImage],
        });

        expect(result.durationSeconds).toBe(5);
        const submission = requests.find((r) => r.url === LITE_IMAGE_ENDPOINT);
        expect(submission).toBeDefined();
        expect(submission?.body).toMatchObject({
            prompt: "animate this artwork",
            aspect_ratio: "auto",
            image_url: startImage,
            generate_audio: true,
        });
    });

    it("routes Pro model to kandinsky6-pro endpoints", async () => {
        const requests: ProviderRequest[] = [];
        mockFalFetch(requests);

        const result = await callKandinskyFalVideoAPI(
            "cinematic mountain landscape",
            {
                ...baseParams,
                model: "kandinsky/kandinsky-6-pro",
            },
        );

        expect(result.trackingData?.actualModel).toBe(
            "kandinsky/kandinsky-6-pro",
        );
        const submission = requests.find((r) => r.url === PRO_TEXT_ENDPOINT);
        expect(submission).toBeDefined();
    });

    it("rejects duration other than 5 seconds", async () => {
        await expect(
            callKandinskyFalVideoAPI("invalid duration", {
                ...baseParams,
                duration: 10,
            }),
        ).rejects.toThrow("Kandinsky 6.0 supports exactly 5 seconds");
    });

    it("rejects more than 1 reference frame", async () => {
        await expect(
            callKandinskyFalVideoAPI("too many frames", {
                ...baseParams,
                image: [
                    "https://media.pollinations.ai/start.png",
                    "https://media.pollinations.ai/end.png",
                ],
            }),
        ).rejects.toThrow(
            "Kandinsky 6.0 supports a start frame only (maximum 1 image)",
        );
    });

    it("handles upstream generation failure", async () => {
        const requests: ProviderRequest[] = [];
        mockFalFetch(requests, "FAILED");

        await expect(
            callKandinskyFalVideoAPI("a doomed generation", baseParams),
        ).rejects.toThrow("provider rejected generation");
    });
});
