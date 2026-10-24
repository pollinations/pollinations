import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callRecraftFlashFalAPI } from "../../src/image/models/recraftFalModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const FAL_URL = "https://fal.run/recraft/v4.1/flash/text-to-image";
const IMAGE_URL = "https://v3.fal.media/files/recraft.webp";

const params: ImageParams = {
    model: "recraft/recraft-v4.1-flash",
    width: 1280,
    height: 720,
    dimensionsExplicit: true,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: false,
};

function mockFal(requests: Record<string, unknown>[]) {
    syncImageEnv({ FAL_KEY: "fal-test-key" } as CloudflareBindings, [
        "FAL_KEY",
    ]);
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            if (String(url) === FAL_URL) {
                requests.push(JSON.parse(init?.body as string));
                return Response.json(
                    {
                        images: [
                            { url: IMAGE_URL, content_type: "image/webp" },
                        ],
                    },
                    { headers: { "x-fal-billable-units": "1" } },
                );
            }
            return new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "image/webp" },
            });
        });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("callRecraftFlashFalAPI", () => {
    it("sends the native size preset for the ratio and bills fal's units", async () => {
        const requests: Record<string, unknown>[] = [];
        mockFal(requests);

        const result = await callRecraftFlashFalAPI("a lighthouse", params);

        expect(requests[0]).toEqual({
            prompt: "a lighthouse",
            image_size: "landscape_16_9",
        });
        expect(result.trackingData).toEqual({
            actualModel: "recraft/recraft-v4.1-flash",
            usage: { completionImageTokens: 1 },
        });
    });

    it("rejects an unsupported aspect ratio before calling fal", async () => {
        const fetchSpy = mockFal([]);

        await expect(
            callRecraftFlashFalAPI("a lighthouse", {
                ...params,
                aspectRatio: "21:9",
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
