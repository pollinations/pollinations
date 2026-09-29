import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callFalQwenImageAPI } from "../../src/image/models/falQwenImageModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const GENERATE_URL = "https://fal.run/alibaba/qwen-image-3/text-to-image";
const EDIT_URL = "https://fal.run/alibaba/qwen-image-3/edit";
const OUTPUT_URL = "https://fal.media/qwen-image-3.png";
const INPUT_IMAGE = "data:image/png;base64,AQID";

const baseParams: ImageParams = {
    model: "qwen/qwen-image-3",
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
    url: string;
    headers: Headers;
    body: Record<string, unknown>;
}

function mockFal(requests: FalRequest[], responseBody: unknown = undefined) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
            const url = input.toString();
            if (url === GENERATE_URL || url === EDIT_URL) {
                requests.push({
                    url,
                    headers: new Headers(init?.headers),
                    body: JSON.parse(init?.body as string) as Record<
                        string,
                        unknown
                    >,
                });
                return Response.json(
                    responseBody ?? { images: [{ url: OUTPUT_URL }], seed: 42 },
                );
            }
            if (url === OUTPUT_URL) {
                return new Response(new Uint8Array([1, 2, 3]), {
                    headers: { "Content-Type": "image/png" },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });
}

const callQwen3 = (prompt: string, params: ImageParams) =>
    callFalQwenImageAPI(prompt, params, "qwen/qwen-image-3:fal");

beforeEach(() => {
    syncImageEnv({ FAL_KEY: "fal-test-key" } as CloudflareBindings, [
        "FAL_KEY",
    ]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("qwenImage3Model", () => {
    it("generates one seeded PNG at the default 1K size", async () => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        const result = await callQwen3("A poster reading BUILD", baseParams);

        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            url: GENERATE_URL,
            body: {
                prompt: "A poster reading BUILD",
                image_size: { width: 1024, height: 1024 },
                enable_prompt_expansion: false,
                enable_safety_checker: false,
                output_format: "png",
                seed: 42,
            },
        });
        expect(requests[0].headers.get("Authorization")).toBe(
            "Key fal-test-key",
        );
        expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
        expect(result.trackingData).toEqual({
            actualModel: "qwen/qwen-image-3",
            usage: { completionImageTokens: 1 },
        });
    });

    it("forwards explicit 2K dimensions", async () => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        await callQwen3("large image", {
            ...baseParams,
            width: 2048,
            height: 2048,
            dimensionsExplicit: true,
        });

        expect(requests[0].body.image_size).toEqual({
            width: 2048,
            height: 2048,
        });
    });

    it("forwards explicit dimensions without rounding", async () => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        await callQwen3("odd size", {
            ...baseParams,
            width: 1000,
            height: 700,
            dimensionsExplicit: true,
        });

        expect(requests[0].body.image_size).toEqual({
            width: 1000,
            height: 700,
        });
    });

    it.each([
        1, 3,
    ])("routes edits with %i reference image(s) and meters each input", async (imageCount) => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        const result = await callQwen3("edit the references", {
            ...baseParams,
            image: Array.from({ length: imageCount }, () => INPUT_IMAGE),
        });

        expect(requests[0].url).toBe(EDIT_URL);
        expect(requests[0].body.image_urls).toEqual(
            Array.from({ length: imageCount }, () => INPUT_IMAGE),
        );
        expect(result.trackingData?.usage).toEqual({
            promptImageTokens: imageCount,
            completionImageTokens: 1,
        });
    });

    it("rejects more than three reference images before calling Fal", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callQwen3("too many references", {
                ...baseParams,
                image: Array.from({ length: 4 }, () => INPUT_IMAGE),
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
        [256, 256],
        [4096, 4096],
    ])("rejects output dimensions outside Fal's pixel range (%ix%i)", async (width, height) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callQwen3("invalid size", {
                ...baseParams,
                width,
                height,
                dimensionsExplicit: true,
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
        ["1:1", { width: 1024, height: 1024 }],
        ["16:9", { width: 1376, height: 768 }],
        ["9:16", { width: 768, height: 1376 }],
        ["21:9", { width: 1568, height: 672 }],
        ["adaptive", { width: 1024, height: 1024 }],
    ] as const)("keeps the default area for aspect ratio %s", async (aspectRatio, expected) => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        await callQwen3("aspect ratio", {
            ...baseParams,
            aspectRatio,
        });

        expect(requests[0].body.image_size).toEqual(expected);
    });

    it("rejects a successful Fal response without an output image", async () => {
        mockFal([], { images: [] });

        await expect(
            callQwen3("missing output", baseParams),
        ).rejects.toMatchObject({
            status: 502,
            requestUrl: new URL(GENERATE_URL),
        });
    });
});
