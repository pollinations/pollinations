import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callWan3FalAPI } from "../../src/image/models/wan3FalVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const TEXT_ENDPOINT =
    "https://queue.fal.run/alibaba/wan-3.0-prime/text-to-video";
const IMAGE_ENDPOINT =
    "https://queue.fal.run/alibaba/wan-3.0-prime/image-to-video";
const R2V_ENDPOINT =
    "https://queue.fal.run/alibaba/wan-3.0-prime/reference-to-video";
const STATUS_URL =
    "https://queue.fal.run/alibaba/wan-3.0-prime/requests/test/status";
const RESULT_URL = "https://queue.fal.run/alibaba/wan-3.0-prime/requests/test";
const PRICING_URL = "https://api.fal.ai/v1/models/pricing";
const VIDEO_URL = "https://fal.media/wan-3-test.mp4";
const VIDEO_BYTES = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]);
const REF_IMAGE_URL = "https://media.pollinations.ai/ref-style.png";
const REF_VIDEO_URL = "https://media.pollinations.ai/ref-motion.mp4";
const REF_AUDIO_URL = "https://media.pollinations.ai/ref-sound.mp3";

const baseParams: ImageParams = {
    model: "alibaba/wan-3.0",
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
};

type ProviderRequest = {
    url: string;
    body?: Record<string, unknown>;
};

function mockFalFetch(
    requests: ProviderRequest[],
    status: "COMPLETED" | "FAILED" = "COMPLETED",
    reportedDuration: number | null = 5,
    billableUnits = 6.8,
) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href.startsWith(PRICING_URL)) {
                const endpoint_id = new URL(href).searchParams.get(
                    "endpoint_id",
                );
                return Response.json({
                    prices: [
                        { endpoint_id, unit_price: 0.05, currency: "USD" },
                    ],
                });
            }
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
                href === TEXT_ENDPOINT ||
                href === IMAGE_ENDPOINT ||
                href === R2V_ENDPOINT
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
                return Response.json(
                    {
                        duration: reportedDuration,
                        video: { url: VIDEO_URL, content_type: "video/mp4" },
                    },
                    {
                        headers: {
                            "x-fal-billable-units": String(billableUnits),
                        },
                    },
                );
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

describe("Wan 3.0 Prime via Fal", () => {
    it("prefers an explicit ratio over width/height for text and reference video", async () => {
        for (const reference_videos of [undefined, [REF_VIDEO_URL]]) {
            const requests: ProviderRequest[] = [];
            mockFalFetch(requests);
            await callWan3FalAPI("a sailboat crossing a calm bay", {
                ...baseParams,
                width: 1024,
                height: 1024,
                aspectRatio: "16:9",
                reference_videos,
            });
            expect(requests[0].url).toBe(
                reference_videos ? R2V_ENDPOINT : TEXT_ENDPOINT,
            );
            expect(requests[0].body?.aspect_ratio).toBe("16:9");
        }
    });

    it("waits beyond five minutes without submitting another generation", async () => {
        vi.useFakeTimers();
        const requests: ProviderRequest[] = [];
        const fetchSpy = mockFalFetch(requests);
        const fetchResult = fetchSpy.getMockImplementation();
        if (!fetchResult)
            throw new Error("Missing Fal test fetch implementation");
        const started = Date.now();
        fetchSpy.mockImplementation(async (url, init) => {
            if (String(url) === STATUS_URL && Date.now() - started < 360_000) {
                return Response.json({ status: "IN_PROGRESS" });
            }
            return fetchResult(url, init);
        });
        const generation = callWan3FalAPI("a slow generation", baseParams);
        const assertion = expect(generation).resolves.toMatchObject({
            buffer: Buffer.from(VIDEO_BYTES),
            trackingData: { usage: { completionVideoSeconds: 5 } },
        });
        await vi.advanceTimersByTimeAsync(362_000);
        await assertion;
        expect(
            requests.filter((request) => request.url === TEXT_ENDPOINT),
        ).toHaveLength(1);
    });

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
    ] as const)(
        "routes resolution %s as %s",
        async (resolution, expectedResolution, audio, image, expectedAspectRatio, endpoint) => {
            const requests: ProviderRequest[] = [];
            mockFalFetch(requests);

            const result = await callWan3FalAPI(
                "a sailboat crossing a calm bay",
                {
                    ...baseParams,
                    resolution,
                    audio,
                    image: [...image],
                    width: expectedAspectRatio === "9:16" ? 720 : 1280,
                    height: expectedAspectRatio === "9:16" ? 1280 : 720,
                },
            );

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
                    actualModel: "alibaba/wan-3.0",
                    usage: { completionVideoSeconds: 5 },
                },
            });
        },
    );

    it("surfaces a terminal provider failure", async () => {
        mockFalFetch([], "FAILED");

        await expect(
            callWan3FalAPI("a rejected prompt", baseParams),
        ).rejects.toMatchObject({
            status: 502,
            message: "provider rejected prompt",
        });
    });

    it("forwards longer durations and bills the duration fal reports", async () => {
        const requests: ProviderRequest[] = [];
        mockFalFetch(requests, "COMPLETED", 9.8);

        const result = await callWan3FalAPI("a sailboat crossing a calm bay", {
            ...baseParams,
            duration: 10,
        });

        expect(requests[0].body?.duration).toBe(10);
        expect(result).toMatchObject({
            durationSeconds: 9.8,
            trackingData: { usage: { completionVideoSeconds: 9.8 } },
        });
    });

    it("refuses a result without a reported duration", async () => {
        mockFalFetch([], "COMPLETED", null);

        await expect(
            callWan3FalAPI("a sailboat crossing a calm bay", baseParams),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("I2V forwards end_image_url when image[1] is present", async () => {
        const requests: ProviderRequest[] = [];
        mockFalFetch(requests);
        const START = "https://media.pollinations.ai/start.png";
        const END = "https://media.pollinations.ai/end.png";

        await callWan3FalAPI("smooth transition", {
            ...baseParams,
            image: [START, END],
            aspectRatio: "9:16",
        });

        expect(requests[0].url).toBe(IMAGE_ENDPOINT);
        expect(requests[0].body?.start_image_url).toBe(START);
        expect(requests[0].body?.end_image_url).toBe(END);
        expect(requests[0].body?.aspect_ratio).toBe("adaptive");
    });

    it("R2V maps Pollinations references to the Fal Prime contract", async () => {
        const requests: ProviderRequest[] = [];
        // 5 s at 1080p: fal bills 5.6 units a second.
        mockFalFetch(requests, "COMPLETED", 5, 28);

        const result = await callWan3FalAPI("artistic style", {
            ...baseParams,
            width: 720,
            height: 1280,
            dimensionsExplicit: true,
            resolution: "1080p",
            audio: true,
            reference_images: [REF_IMAGE_URL],
            reference_videos: [REF_VIDEO_URL],
            reference_audios: [REF_AUDIO_URL],
        });

        expect(requests[0].url).toBe(R2V_ENDPOINT);
        expect(requests[0].body).toMatchObject({
            prompt: "artistic style",
            resolution: "1080p",
            aspect_ratio: "9:16",
            duration: 5,
            audio: true,
            reference_image_urls: [REF_IMAGE_URL],
            reference_video_urls: [REF_VIDEO_URL],
            reference_audio_urls: [REF_AUDIO_URL],
        });
        expect(requests[0].body).not.toHaveProperty("reference_images");
        expect(requests[0].body).not.toHaveProperty("reference_videos");
        expect(requests[0].body).not.toHaveProperty("reference_audios");
        expect(result.trackingData).toEqual({
            actualModel: "alibaba/wan-3.0",
            usage: { completionVideoSeconds: 5 },
            providerBilling: { units: 28, unitCost: 0.05 },
        });
    });

    it("R2V keeps the reference video's shape and bills its seconds", async () => {
        const requests: ProviderRequest[] = [];
        // fal billed one real 720p edit 28.2385 units: 10.085 s at 2.8 a second.
        mockFalFetch(requests, "COMPLETED", 5, 28.2385);

        const result = await callWan3FalAPI("make it night", {
            ...baseParams,
            width: 1024,
            height: 1024,
            resolution: "720p",
            reference_videos: [REF_VIDEO_URL],
        });

        expect(requests[0].body?.aspect_ratio).toBe("adaptive");
        expect(result.trackingData?.usage).toEqual({
            completionVideoSeconds: 5,
            promptVideoSeconds: 5.085,
        });
        const billed = calculateUsageBilling({
            model: "alibaba/wan-3.0",
            usage: result.trackingData?.usage ?? {},
            servedBy: IMAGE_SERVICES["alibaba/wan-3.0:fal"],
            quotedBy: IMAGE_SERVICES["alibaba/wan-3.0"],
            input: {
                resolution: "720p",
                providerBilling: result.trackingData?.providerBilling,
            },
        });
        expect(billed.cost.totalCost).toBeCloseTo(1.411925);
        expect(billed.price.totalPrice).toBeCloseTo(1.4119);
    });

    it("R2V omits absent Fal reference fields from the request body", async () => {
        const requests: ProviderRequest[] = [];
        mockFalFetch(requests);

        await callWan3FalAPI("artistic style", {
            ...baseParams,
            reference_images: [REF_IMAGE_URL],
        });

        expect(requests[0].url).toBe(R2V_ENDPOINT);
        expect(requests[0].body?.reference_image_urls).toEqual([REF_IMAGE_URL]);
        expect(requests[0].body).not.toHaveProperty("reference_video_urls");
        expect(requests[0].body).not.toHaveProperty("reference_audio_urls");
    });

    it("rejects frame + reference combination with 400", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callWan3FalAPI("conflict", {
                ...baseParams,
                image: ["https://media.pollinations.ai/start.png"],
                reference_images: [REF_IMAGE_URL],
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
