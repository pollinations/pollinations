import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callQwenImage3API } from "../../src/image/models/qwenImage3Model.ts";
import type { ImageParams } from "../../src/image/params.ts";

const FAL_URL = "https://fal.run/alibaba/qwen-image-3/text-to-image";
const IMAGE_URL = "https://fal.media/qwen-image-3.png";

const baseParams: ImageParams = {
    model: "qwen-image-3",
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
};

interface FalRequest {
    headers: Headers;
    body: Record<string, unknown>;
}

function mockFal(requests: FalRequest[]) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
            const url = input.toString();
            if (url === FAL_URL) {
                requests.push({
                    headers: new Headers(init?.headers),
                    body: JSON.parse(init?.body as string) as Record<
                        string,
                        unknown
                    >,
                });
                return Response.json({
                    images: [{ url: IMAGE_URL }],
                    seed: 42,
                });
            }
            if (url === IMAGE_URL) {
                return new Response(new Uint8Array([1, 2, 3]), {
                    headers: { "Content-Type": "image/png" },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });
}

beforeEach(() => {
    syncImageEnv({ FAL_KEY: "fal-test-key" } as CloudflareBindings, [
        "FAL_KEY",
    ]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("qwenImage3Model", () => {
    it("generates one PNG with deterministic parameters and flat image usage", async () => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        const result = await callQwenImage3API("A poster reading BUILD", {
            ...baseParams,
            aspectRatio: "16:9",
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].headers.get("Authorization")).toBe(
            "Key fal-test-key",
        );
        expect(requests[0].body).toEqual({
            prompt: "A poster reading BUILD",
            image_size: "landscape_16_9",
            enable_prompt_expansion: false,
            enable_safety_checker: true,
            num_images: 1,
            output_format: "png",
            seed: 42,
        });
        expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
        expect(result.trackingData).toEqual({
            actualModel: "qwen-image-3",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        });
    });

    it("forwards explicit dimensions", async () => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        await callQwenImage3API("custom dimensions", {
            ...baseParams,
            width: 1280,
            height: 720,
            dimensionsExplicit: true,
        });

        expect(requests[0].body.image_size).toEqual({
            width: 1280,
            height: 720,
        });
    });

    it("rejects unsupported aspect ratios before calling fal", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callQwenImage3API("ultrawide", {
                ...baseParams,
                aspectRatio: "21:9",
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects reference images instead of silently ignoring them", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callQwenImage3API("edit this", {
                ...baseParams,
                image: ["https://example.com/input.png"],
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
