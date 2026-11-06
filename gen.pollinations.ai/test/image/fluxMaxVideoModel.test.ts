import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callFluxMaxVideoAPI } from "../../src/image/models/fluxMaxVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const TEXT_ENDPOINT =
    "https://queue.fal.run/blackforestlabs/flux-3-max/text-to-video";
const IMAGE_ENDPOINT =
    "https://queue.fal.run/blackforestlabs/flux-3-max/image-to-video";
const STATUS_URL =
    "https://queue.fal.run/blackforestlabs/flux-3-max/requests/test/status";
const RESULT_URL =
    "https://queue.fal.run/blackforestlabs/flux-3-max/requests/test";
const VIDEO_URL = "https://fal.media/flux-3-max-test.mp4";
const VIDEO_BYTES = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]);
const PRICING_URL = "https://api.fal.ai/v1/models/pricing?endpoint_id=";
const UNIT_PRICE = 0.02125;

const baseParams: ImageParams = {
    model: "black-forest-labs/flux-3-max",
    width: 1280,
    height: 720,
    dimensionsExplicit: true,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    duration: 5,
};

type ProviderRequest = {
    url: string;
    body?: Record<string, unknown>;
};

// fal reports resolution-weighted units on the result fetch. The mock reports
// 6 units for a 5 s request so the tests show billing follows fal's units at
// fal's live unit price, not the requested seconds.
function mockFluxFetch(requests: ProviderRequest[]) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            // Pricing lookups are not provider requests under test.
            if (href.startsWith(PRICING_URL)) {
                const endpointId = decodeURIComponent(
                    href.slice(PRICING_URL.length),
                );
                return Response.json({
                    prices: [
                        {
                            endpoint_id: endpointId,
                            unit_price: UNIT_PRICE,
                            currency: "USD",
                        },
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
            if (href === TEXT_ENDPOINT || href === IMAGE_ENDPOINT) {
                return Response.json({
                    status_url: STATUS_URL,
                    response_url: RESULT_URL,
                });
            }
            if (href === STATUS_URL) {
                return Response.json({ status: "COMPLETED" });
            }
            if (href === RESULT_URL) {
                return Response.json(
                    { video: { url: VIDEO_URL, content_type: "video/mp4" } },
                    { headers: { "x-fal-billable-units": "6" } },
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
    vi.restoreAllMocks();
});

describe("callFluxMaxVideoAPI", () => {
    it("sends the 720p, audio-on defaults and bills provider-reported units", async () => {
        const requests: ProviderRequest[] = [];
        mockFluxFetch(requests);

        const result = await callFluxMaxVideoAPI("a slow dolly shot", {
            ...baseParams,
        });

        expect(requests[0]).toMatchObject({
            url: TEXT_ENDPOINT,
            body: {
                prompt: "a slow dolly shot",
                resolution: "720p",
                duration: 5,
                generate_audio: true,
                seed: 42,
            },
        });
        expect(requests[0].body?.aspect_ratio).toBe("16:9");
        expect(requests[0].body).not.toHaveProperty("reasoning_level");
        expect(result.durationSeconds).toBe(5);
        expect(result.trackingData).toEqual({
            actualModel: "black-forest-labs/flux-3-max",
            usage: { completionVideoSeconds: 5 },
            providerBilling: { units: 6, unitCost: UNIT_PRICE },
        });
    });

    it("routes image-to-video with start and end frames and maps 1080p", async () => {
        const requests: ProviderRequest[] = [];
        mockFluxFetch(requests);

        await callFluxMaxVideoAPI("the door opens", {
            ...baseParams,
            image: [
                "https://example.com/start.png",
                "https://example.com/end.png",
            ],
            resolution: "1080p",
            audio: false,
        });

        expect(requests[0]).toMatchObject({
            url: IMAGE_ENDPOINT,
            body: {
                prompt: "the door opens",
                image_url: "https://example.com/start.png",
                end_image_url: "https://example.com/end.png",
                resolution: "1080p",
                generate_audio: false,
            },
        });
        expect(requests[0].body).not.toHaveProperty("aspect_ratio");
    });

    it("derives the closest supported aspect ratio from explicit portrait dimensions", async () => {
        const requests: ProviderRequest[] = [];
        mockFluxFetch(requests);

        await callFluxMaxVideoAPI("a tall street", {
            ...baseParams,
            width: 1080,
            height: 1920,
        });

        expect(requests[0].body?.aspect_ratio).toBe("9:16");
    });

    it("rejects unsupported duration and aspect ratio before submission", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callFluxMaxVideoAPI("scene", { ...baseParams, duration: 4 }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            callFluxMaxVideoAPI("scene", {
                ...baseParams,
                aspectRatio: "9:21",
            }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            callFluxMaxVideoAPI("scene", {
                ...baseParams,
                aspectRatio: "adaptive",
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
