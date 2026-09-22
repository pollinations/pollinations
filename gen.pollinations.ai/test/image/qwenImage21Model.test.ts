import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callQwenImage21API } from "../../src/image/models/qwenImage21Model.ts";
import type { ImageParams } from "../../src/image/params.ts";

const GENERATE_URL = "https://fal.run/alibaba/qwen-image-2.1/text-to-image";
const EDIT_URL = "https://fal.run/alibaba/qwen-image-2.1/edit";
const OUTPUT_URL = "https://fal.media/qwen-image-2.1.png";

// PNG header only: enough for dimension parsing (1024x512 = 0.524288 MP).
const INPUT_PNG = Buffer.alloc(24);
INPUT_PNG.set([0x89, 0x50, 0x4e, 0x47]);
INPUT_PNG.writeUInt32BE(1024, 16);
INPUT_PNG.writeUInt32BE(512, 20);
const INPUT_IMAGE = `data:image/png;base64,${INPUT_PNG.toString("base64")}`;
// Same bytes, undecodable mime type: readImageDimensions returns null for it.
const UNMETERABLE_IMAGE = `data:application/octet-stream;base64,${INPUT_PNG.toString("base64")}`;

const baseParams: ImageParams = {
    model: "qwen/qwen-image-2.1",
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

beforeEach(() => {
    syncImageEnv({ FAL_KEY: "fal-test-key" } as CloudflareBindings, [
        "FAL_KEY",
    ]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("qwenImage21Model", () => {
    it("generates one seeded PNG and meters output megapixels", async () => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        const result = await callQwenImage21API(
            "A poster reading BUILD",
            baseParams,
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            url: GENERATE_URL,
            body: {
                prompt: "A poster reading BUILD",
                image_size: { width: 1024, height: 1024 },
                enable_safety_checker: true,
                num_images: 1,
                output_format: "png",
                seed: 42,
            },
        });
        expect(requests[0].headers.get("Authorization")).toBe(
            "Key fal-test-key",
        );
        expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
        expect(result.trackingData).toEqual({
            actualModel: "qwen/qwen-image-2.1",
            usage: { completionImageTokens: 1.048576 },
        });
    });

    it("rounds the size to multiples of 32 and meters the rounded pixels", async () => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        const result = await callQwenImage21API("wide", {
            ...baseParams,
            width: 1280,
            height: 720,
            dimensionsExplicit: true,
        });

        expect(requests[0].body.image_size).toEqual({
            width: 1280,
            height: 736,
        });
        expect(result.trackingData?.usage).toEqual({
            completionImageTokens: (1280 * 736) / 1_000_000,
        });
    });

    it.each([
        ["16:9", 1376, 768],
        ["9:16", 768, 1376],
        ["1:1", 1024, 1024],
    ] as const)("resolves aspectRatio %s into a matching size when dimensions are not explicit", async (aspectRatio, width, height) => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        const result = await callQwenImage21API("aspect ratio", {
            ...baseParams,
            aspectRatio,
        });

        expect(requests[0].body.image_size).toEqual({ width, height });
        expect(result.trackingData?.usage).toEqual({
            completionImageTokens: (width * height) / 1_000_000,
        });
    });

    it("ignores aspectRatio once dimensions are explicit", async () => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        await callQwenImage21API("explicit wins", {
            ...baseParams,
            width: 1280,
            height: 720,
            dimensionsExplicit: true,
            aspectRatio: "9:16",
        });

        expect(requests[0].body.image_size).toEqual({
            width: 1280,
            height: 736,
        });
    });

    it("rejects a reference image whose dimensions can't be parsed instead of billing it as zero", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callQwenImage21API("unmeterable reference", {
                ...baseParams,
                image: [UNMETERABLE_IMAGE],
            }),
        ).rejects.toMatchObject({ status: 400 });
        // Rejected before submitting to fal.
        expect(fetchSpy).not.toHaveBeenCalledWith(EDIT_URL, expect.anything());
    });

    it("routes edits to the edit endpoint and meters input megapixels", async () => {
        const requests: FalRequest[] = [];
        mockFal(requests);

        const result = await callQwenImage21API("edit the references", {
            ...baseParams,
            image: [INPUT_IMAGE, INPUT_IMAGE],
        });

        expect(requests[0].url).toBe(EDIT_URL);
        expect(requests[0].body.image_urls).toEqual([INPUT_IMAGE, INPUT_IMAGE]);
        expect(result.trackingData?.usage).toEqual({
            promptImageTokens: (2 * 1024 * 512) / 1_000_000,
            completionImageTokens: 1.048576,
        });
    });

    it("rejects more than ten reference images before calling Fal", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callQwenImage21API("too many references", {
                ...baseParams,
                image: Array.from({ length: 11 }, () => INPUT_IMAGE),
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects a successful Fal response without an output image", async () => {
        mockFal([], { images: [] });

        await expect(
            callQwenImage21API("missing output", baseParams),
        ).rejects.toMatchObject({
            status: 502,
            requestUrl: new URL(GENERATE_URL),
        });
    });
});
