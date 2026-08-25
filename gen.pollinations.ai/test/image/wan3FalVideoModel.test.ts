import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callWan3FalAPI } from "../../src/image/models/wan3FalVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const TEXT_ENDPOINT =
    "https://queue.fal.run/alibaba/wan-3.0-prime/text-to-video";
const IMAGE_ENDPOINT =
    "https://queue.fal.run/alibaba/wan-3.0-prime/image-to-video";
const STATUS_URL =
    "https://queue.fal.run/alibaba/wan-3.0-prime/requests/test/status";
const RESULT_URL = "https://queue.fal.run/alibaba/wan-3.0-prime/requests/test";
const VIDEO_URL = "https://fal.media/wan-3-test.mp4";
const VIDEO_BYTES = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]);

const baseParams: ImageParams = {
    model: "wan-3.0",
    width: 1280,
    height: 720,
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
            if (href === TEXT_ENDPOINT || href === IMAGE_ENDPOINT) {
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

describe("Wan 3.0 Prime via Fal", () => {
    it.each([
        [undefined, "480p", false, [], "16:9", TEXT_ENDPOINT],
        ["720p", "720p", true, [], "9:16", TEXT_ENDPOINT],
        [
            "1080p",
            "1080p",
            true,
            ["https://media.pollinations.ai/start.png"],
            "adaptive",
            IMAGE_ENDPOINT,
        ],
    ] as const)("routes resolution %s as %s", async (resolution, expectedResolution, audio, image, expectedAspectRatio, endpoint) => {
        const requests: ProviderRequest[] = [];
        mockFalFetch(requests);

        const result = await callWan3FalAPI("a sailboat crossing a calm bay", {
            ...baseParams,
            resolution,
            audio,
            image: [...image],
            width: expectedAspectRatio === "9:16" ? 720 : 1280,
            height: expectedAspectRatio === "9:16" ? 1280 : 720,
        });

        expect(requests[0]).toEqual({
            url: endpoint,
            body: {
                prompt: "a sailboat crossing a calm bay",
                resolution: expectedResolution,
                aspect_ratio: expectedAspectRatio,
                duration: 5,
                audio,
                enable_prompt_expansion: true,
                enable_safety_checker: true,
                seed: 42,
                ...(image[0] ? { start_image_url: image[0] } : {}),
            },
        });
        expect(result).toMatchObject({
            buffer: Buffer.from(VIDEO_BYTES),
            mimeType: "video/mp4",
            durationSeconds: 5,
            trackingData: {
                actualModel: "wan-3.0",
                usage: { completionVideoSeconds: 5 },
            },
        });
    });

    it("surfaces a terminal provider failure", async () => {
        mockFalFetch([], "FAILED");

        await expect(
            callWan3FalAPI("a rejected prompt", baseParams),
        ).rejects.toMatchObject({
            status: 502,
            message: "provider rejected prompt",
        });
    });

    it("rejects durations outside the five-second contract", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callWan3FalAPI("a sailboat crossing a calm bay", {
                ...baseParams,
                duration: 4,
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
