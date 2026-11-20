import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callVercelSeedance25FlashAPI } from "../../src/image/models/seedanceFlashVercelModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const params: ImageParams = {
    model: "bytedance/seedance-2.5-flash",
    width: 854,
    height: 480,
    resolution: "480p",
    duration: 4,
    dimensionsExplicit: false,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
};
const first = "https://example.com/first.png";
const last = "https://example.com/last.png";
const video = "https://example.com/ref.mp4";
const audio = "https://example.com/ref.wav";

afterEach(() => vi.restoreAllMocks());

describe("Vercel Seedance Flash input modes", () => {
    it.each([
        {
            inputs: { image: [first, last] },
            expected: {
                frameImages: [
                    {
                        frameType: "first_frame",
                        image: { type: "url", url: first },
                    },
                    {
                        frameType: "last_frame",
                        image: { type: "url", url: last },
                    },
                ],
            },
        },
        {
            inputs: {
                reference_images: [first],
                reference_videos: [video],
                reference_audios: [audio],
            },
            expected: {
                inputReferences: [
                    { type: "url", url: first, mediaType: "image/*" },
                    { type: "url", url: video, mediaType: "video/*" },
                ],
                providerOptions: { bytedance: { referenceAudio: [audio] } },
            },
        },
    ])("preserves the upstream media roles", async ({ inputs, expected }) => {
        syncImageEnv({ AI_GATEWAY_API_KEY: "test" } as CloudflareBindings, [
            "AI_GATEWAY_API_KEY",
        ]);
        let body: unknown;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            if (String(url).endsWith("/video-model/start")) {
                body = JSON.parse(String(init?.body));
                return Response.json({
                    operation: { gatewayJobId: "test-job" },
                });
            }
            expect(String(url)).toMatch(/\/video-model\/status$/);
            return Response.json({
                status: "completed",
                videos: [
                    { type: "base64", data: "AAAA", mediaType: "video/mp4" },
                ],
                providerMetadata: {
                    bytedance: { usage: { completion_tokens: 24500 } },
                },
            });
        });
        const result = await callVercelSeedance25FlashAPI("a boat", {
            ...params,
            ...inputs,
        });
        expect(body).toMatchObject({ ...expected, resolution: "864x480" });
        if ("image" in inputs) expect(body).not.toHaveProperty("aspectRatio");
        const billing = calculateUsageBilling({
            model: params.model,
            servedBy: IMAGE_SERVICES["bytedance/seedance-2.5-flash"],
            usage: result.trackingData.usage,
            input: { hasReferenceVideo: "reference_videos" in inputs },
        });
        expect(billing.cost.totalCost).toBeCloseTo(
            "image" in inputs ? 0.1715 : 0.10535,
            10,
        );
        expect(billing.price.totalPrice).toBeCloseTo(
            billing.cost.totalCost,
            10,
        );
        expect(result.trackingData.usage.completionVideoTokens).toBe(24500);
    });
});
