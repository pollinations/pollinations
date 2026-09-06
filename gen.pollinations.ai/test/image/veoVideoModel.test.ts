import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import {
    calculateUsageBilling,
    getVisibleImageModels,
} from "@shared/registry/registry.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type FallbackAttempt, withModelFallback } from "../../src/fallback.ts";
import { createAndReturnVideo } from "../../src/image/createAndReturnVideos.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import { callVeoAPI } from "../../src/image/models/veoVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";
import googleCloudAuth from "../../src/text/auth/googleCloudAuth.ts";

const FIRST_FRAME_URL = "https://image.example.com/first.png";
const LAST_FRAME_URL = "https://image.example.com/last.png";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const baseParams: ImageParams = {
    model: "veo",
    width: 1280,
    height: 720,
    dimensionsExplicit: true,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: true,
    duration: 4,
};

function mockVeoFetch(requests: Array<Record<string, unknown>>) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href === FIRST_FRAME_URL || href === LAST_FRAME_URL) {
                return new Response(PNG_BYTES, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            if (href.endsWith(":predictLongRunning")) {
                requests.push(
                    JSON.parse(init?.body as string) as Record<string, unknown>,
                );
                return Response.json({
                    name: "projects/test/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/test-operation",
                });
            }
            if (href.endsWith(":fetchPredictOperation")) {
                return Response.json({
                    done: true,
                    response: {
                        videos: [
                            {
                                bytesBase64Encoded:
                                    Buffer.from("test-video").toString(
                                        "base64",
                                    ),
                                mimeType: "video/mp4",
                            },
                        ],
                    },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });
}

function setGoogleEnv() {
    syncImageEnv({ GOOGLE_PROJECT_ID: "test-project" } as CloudflareBindings, [
        "GOOGLE_PROJECT_ID",
    ]);
    vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue("test-token");
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("veoVideoModel resolution selection", () => {
    it("defaults veo to 720p and omits audio usage when disabled", async () => {
        setGoogleEnv();
        const requests: Array<Record<string, unknown>> = [];
        mockVeoFetch(requests);

        const result = await callVeoAPI("a calm ocean at sunrise", {
            ...baseParams,
            width: 1920,
            height: 1080,
            audio: false,
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].parameters).toMatchObject({
            resolution: "720p",
            generateAudio: false,
        });
        expect(result.trackingData).toEqual({
            actualModel: "veo",
            usage: { completionVideoSeconds: 4 },
        });
    });

    it("passes an explicit 1080p resolution and reports enabled audio", async () => {
        setGoogleEnv();
        const requests: Array<Record<string, unknown>> = [];
        mockVeoFetch(requests);

        const result = await callVeoAPI("a calm ocean at sunrise", {
            ...baseParams,
            resolution: "1080p",
            width: 1280,
            height: 720,
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].parameters).toMatchObject({
            resolution: "1080p",
            generateAudio: true,
        });
        expect(result.trackingData).toEqual({
            actualModel: "veo",
            usage: {
                completionVideoSeconds: 4,
                completionAudioSeconds: 4,
            },
        });
    });

    it("maps the first and second images to Veo start and end frames", async () => {
        setGoogleEnv();
        const requests: Array<Record<string, unknown>> = [];
        mockVeoFetch(requests);

        await callVeoAPI("move between these frames", {
            ...baseParams,
            image: [FIRST_FRAME_URL, LAST_FRAME_URL],
        });

        expect(requests[0]).toMatchObject({
            instances: [
                {
                    image: {
                        bytesBase64Encoded:
                            Buffer.from(PNG_BYTES).toString("base64"),
                        mimeType: "image/png",
                    },
                    lastFrame: {
                        bytesBase64Encoded:
                            Buffer.from(PNG_BYTES).toString("base64"),
                        mimeType: "image/png",
                    },
                },
            ],
        });
    });
});

describe("Veo Replicate fallback", () => {
    it("stays internal and preserves the public contract", () => {
        expect(IMAGE_SERVICES.veo.fallbacks).toEqual(["veo-replicate"]);
        expect(IMAGE_SERVICES["veo-replicate"]).toMatchObject({
            provider: "replicate",
            aliases: [],
            hidden: true,
            fallbackOnly: true,
            paidOnly: true,
            priceMultiplier: 1,
            videoCapabilities: IMAGE_SERVICES.veo.videoCapabilities,
            allowedDurations: [4, 6, 8],
            maxReferenceImages: 2,
        });
        expect(getVisibleImageModels()).not.toContain("veo-replicate");
    });

    it.each([
        [undefined, undefined, 0, 0.4, 0.32],
        ["720p", true, 1, 0.6, 0.4],
        ["1080p", false, 0, 0.4, 0.4],
        ["1080p", true, 2, 0.6, 0.48],
    ] as const)("routes and bills resolution %s / audio %s / %s frames", async (resolution, audio, frames, cost, price) => {
        syncImageEnv(
            {
                REPLICATE_API_TOKEN: "replicate-test-key",
                GOOGLE_PROJECT_ID: "test-project",
            } as CloudflareBindings,
            ["REPLICATE_API_TOKEN", "GOOGLE_PROJECT_ID"],
        );
        vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue(
            "test-token",
        );
        const inputs: Record<string, unknown>[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            const href = String(url);
            if (href.endsWith(":predictLongRunning")) {
                return Response.json(
                    { error: { message: "Forced primary outage" } },
                    { status: 503 },
                );
            }
            if (href === FIRST_FRAME_URL || href === LAST_FRAME_URL) {
                return new Response(PNG_BYTES, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            if (
                href ===
                "https://api.replicate.com/v1/models/google/veo-3.1-fast/predictions"
            ) {
                inputs.push(JSON.parse(init?.body as string).input);
                return Response.json({
                    id: "veo-fallback-test",
                    status: "succeeded",
                    output: "https://video.example.com/veo.mp4",
                    metrics: { video_output_duration_seconds: 4 },
                });
            }
            return new Response("video", {
                headers: { "Content-Type": "video/mp4" },
            });
        });
        const params = {
            ...baseParams,
            model: "veo-replicate" as const,
            resolution,
            audio: audio ?? false,
            duration: undefined,
            image: [FIRST_FRAME_URL, LAST_FRAME_URL].slice(0, frames),
        };
        const attempts: FallbackAttempt[] = [];
        const { result, index } = await withModelFallback(
            ["veo", ...IMAGE_SERVICES.veo.fallbacks].map((id) => ({
                id,
                definition: IMAGE_SERVICES[id as keyof typeof IMAGE_SERVICES],
            })),
            ({ id }) =>
                createAndReturnVideo(
                    "a paper boat",
                    { ...params, model: id as "veo" | "veo-replicate" },
                    "veo-test",
                ),
            attempts,
        );
        expect(index).toBe(1);
        expect(
            attempts.map(({ candidate, settled }) => [candidate.id, settled]),
        ).toEqual([
            ["veo", false],
            ["veo-replicate", true],
        ]);
        expect(inputs).toEqual([
            {
                prompt: "a paper boat",
                duration: 4,
                resolution: resolution ?? "720p",
                aspect_ratio: "16:9",
                generate_audio: audio === true,
                ...(frames >= 1
                    ? {
                          image: expect.stringMatching(
                              /^data:image\/png;base64,/,
                          ),
                      }
                    : {}),
                ...(frames === 2
                    ? {
                          last_frame: expect.stringMatching(
                              /^data:image\/png;base64,/,
                          ),
                      }
                    : {}),
            },
        ]);
        expect(result.trackingData).toEqual({
            actualModel: "veo-replicate",
            usage: {
                completionVideoSeconds: 4,
                ...(audio ? { completionAudioSeconds: 4 } : {}),
            },
        });
        const billing = calculateUsageBilling({
            model: "veo",
            usage: result.trackingData.usage,
            servedBy: IMAGE_SERVICES["veo-replicate"],
            quotedBy: IMAGE_SERVICES.veo,
            input: { resolution },
        });
        expect(billing.cost.totalCost).toBeCloseTo(cost);
        expect(billing.price.totalPrice).toBeCloseTo(price);
    });
});
