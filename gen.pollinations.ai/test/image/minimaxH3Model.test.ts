import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callMinimaxH3API,
    callMinimaxH3MaxTurboAPI,
} from "../../src/image/models/minimaxH3Model.ts";
import type { ImageParams } from "../../src/image/params.ts";

const H3_ENDPOINT = "https://queue.fal.run/minimax/h3/text-to-video";
const H3_MAX_TURBO_TEXT_ENDPOINT =
    "https://queue.fal.run/minimax/h3-max-turbo/text-to-video";
const H3_MAX_TURBO_IMAGE_ENDPOINT =
    "https://queue.fal.run/minimax/h3-max-turbo/image-to-video";
const STATUS_URL = "https://queue.fal.run/minimax/h3/requests/test/status";
const RESULT_URL = "https://queue.fal.run/minimax/h3/requests/test";
const VIDEO_URL = "https://fal.media/minimax-h3-test.mp4";
const VIDEO_BYTES = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]);

const baseParams: ImageParams = {
    model: "minimax-h3",
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
    duration: 5,
    aspectRatio: "16:9",
};

type ProviderRequest = {
    url: string;
    body?: Record<string, unknown>;
};

function mockH3Fetch(
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
                href === H3_ENDPOINT ||
                href === H3_MAX_TURBO_TEXT_ENDPOINT ||
                href === H3_MAX_TURBO_IMAGE_ENDPOINT
            ) {
                return Response.json({
                    status_url: STATUS_URL,
                    response_url: RESULT_URL,
                });
            }
            if (href === STATUS_URL) {
                return Response.json({
                    status,
                    error: "provider rejected prompt",
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
    vi.restoreAllMocks();
});

describe("callMinimaxH3API", () => {
    it.each([
        [undefined, "480P"],
        ["480p", "480P"],
        ["768p", "768P"],
        ["2k", "2K"],
    ] as const)("routes resolution %s as %s", async (resolution, expected) => {
        const requests: ProviderRequest[] = [];
        mockH3Fetch(requests);

        const result = await callMinimaxH3API("a red wind-up robot", {
            ...baseParams,
            resolution,
        });

        expect(requests[0]).toEqual({
            url: H3_ENDPOINT,
            body: {
                prompt: "a red wind-up robot",
                duration: 5,
                resolution: expected,
                aspect_ratio: "16:9",
                seed: 42,
            },
        });
        expect(result.buffer).toEqual(Buffer.from(VIDEO_BYTES));
        expect(result.mimeType).toBe("video/mp4");
        expect(result.durationSeconds).toBe(5);
        expect(result.trackingData).toEqual({
            actualModel: "minimax-h3",
            usage: { completionVideoSeconds: 5 },
        });
    });

    it("surfaces a terminal provider failure", async () => {
        mockH3Fetch([], "FAILED");

        await expect(
            callMinimaxH3API("a rejected prompt", baseParams),
        ).rejects.toMatchObject({
            status: 502,
            message: "provider rejected prompt",
        });
    });
});

describe("callMinimaxH3MaxTurboAPI", () => {
    it.each([
        [5, "480p", "480P"],
        [5, "768p", "768P"],
        [10, "480p", "480P"],
        [10, "768p", "768P"],
        [15, "480p", "480P"],
        [15, "768p", "768P"],
    ] as const)("routes %ss at %s with deterministic billing", async (duration, resolution, upstreamResolution) => {
        const requests: ProviderRequest[] = [];
        mockH3Fetch(requests);

        const result = await callMinimaxH3MaxTurboAPI(
            "a paper windmill turning gently",
            {
                ...baseParams,
                model: "minimax/minimax-h3-max-turbo",
                duration,
                resolution,
                aspectRatio: "21:9",
            },
        );

        expect(requests[0]).toEqual({
            url: H3_MAX_TURBO_TEXT_ENDPOINT,
            body: {
                prompt: "a paper windmill turning gently",
                duration,
                resolution: upstreamResolution,
                aspect_ratio: "21:9",
                seed: 42,
                enable_safety_checker: true,
                prompt_expansion_mode: "balanced",
            },
        });
        expect(result).toMatchObject({
            buffer: Buffer.from(VIDEO_BYTES),
            mimeType: "video/mp4",
            durationSeconds: duration,
            trackingData: {
                actualModel: "minimax/minimax-h3-max-turbo",
                usage: { completionVideoSeconds: duration },
            },
        });
    });

    it.each([
        [false, 1024, 1024, "16:9"],
        [true, 480, 640, "3:4"],
    ] as const)("uses the expected aspect ratio when dimensionsExplicit is %s", async (dimensionsExplicit, width, height, expectedAspectRatio) => {
        const requests: ProviderRequest[] = [];
        mockH3Fetch(requests);

        await callMinimaxH3MaxTurboAPI("a paper windmill", {
            ...baseParams,
            model: "minimax/minimax-h3-max-turbo",
            aspectRatio: undefined,
            dimensionsExplicit,
            width,
            height,
        });

        expect(requests[0]?.body?.aspect_ratio).toBe(expectedAspectRatio);
    });

    it("forwards first and last frame URLs to the image route", async () => {
        const requests: ProviderRequest[] = [];
        mockH3Fetch(requests);
        const start = "https://media.pollinations.ai/start.png";
        const end = "https://media.pollinations.ai/end.png";

        await callMinimaxH3MaxTurboAPI("a seamless camera move", {
            ...baseParams,
            model: "minimax/minimax-h3-max-turbo",
            duration: 10,
            resolution: "768p",
            image: [start, end],
        });

        expect(requests[0]).toEqual({
            url: H3_MAX_TURBO_IMAGE_ENDPOINT,
            body: {
                prompt: "a seamless camera move",
                duration: 10,
                resolution: "768P",
                seed: 42,
                enable_safety_checker: true,
                prompt_expansion_mode: "balanced",
                image_url: start,
                end_image_url: end,
            },
        });
    });

    it("surfaces a terminal provider failure", async () => {
        mockH3Fetch([], "FAILED");

        await expect(
            callMinimaxH3MaxTurboAPI("a rejected prompt", {
                ...baseParams,
                model: "minimax/minimax-h3-max-turbo",
            }),
        ).rejects.toMatchObject({
            status: 502,
            message: "provider rejected prompt",
        });
    });
});
