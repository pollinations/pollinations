import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveEditDimensionsForImage } from "../../src/image/handler.ts";
import type { ImageParams } from "../../src/image/params.ts";

/** Minimal valid PNG header (8-byte signature + IHDR with width/height). */
function makePng(width: number, height: number): Buffer {
    const bytes = new Uint8Array(33);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    bytes.set([0, 0, 0, 13], 8); // IHDR chunk length
    bytes.set([73, 72, 68, 82], 12); // "IHDR"
    bytes.set(
        [
            (width >> 24) & 0xff,
            (width >> 16) & 0xff,
            (width >> 8) & 0xff,
            width & 0xff,
        ],
        16,
    );
    bytes.set(
        [
            (height >> 24) & 0xff,
            (height >> 16) & 0xff,
            (height >> 8) & 0xff,
            height & 0xff,
        ],
        20,
    );
    return Buffer.from(bytes);
}

/**
 * Minimal valid JPEG header (SOI + APP0 + SOF0). SOF0 declares its full
 * segment length (17 = 8 + 3 components + length field) so the parser can
 * walk past it.
 */
function makeJpeg(width: number, height: number): Buffer {
    const bytes = new Uint8Array([
        0xff,
        0xd8, // SOI
        0xff,
        0xe0,
        0x00,
        0x10,
        0x4a,
        0x46,
        0x49,
        0x46,
        0x00,
        0x01,
        0x01,
        0x00,
        0x00,
        0x01,
        0x00,
        0x01,
        0x00,
        0x00, // APP0 (len 16)
        0xff,
        0xc0,
        0x00,
        0x11,
        0x08, // SOF0 (len 17), precision 8
        (height >> 8) & 0xff,
        height & 0xff, // height
        (width >> 8) & 0xff,
        width & 0xff, // width
        0x03, // 3 components
        0x01,
        0x11,
        0x00, // component 1: id/sampling/qt
        0x02,
        0x11,
        0x00, // component 2
        0x03,
        0x11,
        0x00, // component 3
    ]);
    return Buffer.from(bytes);
}

function makeParams(overrides: Partial<ImageParams> = {}): ImageParams {
    return {
        model: "gpt-image-2",
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
        ...overrides,
    };
}

function mockImageFetch(buffer: Buffer, contentType: string): void {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(new Uint8Array(buffer), {
            status: 200,
            headers: { "content-type": contentType },
        }),
    );
}

function spyOnFetch(): void {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 404 }),
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("resolveEditDimensionsForImage", () => {
    it("preserves a portrait source aspect ratio when size is omitted", async () => {
        mockImageFetch(makePng(800, 1200), "image/png");

        const resolved = await resolveEditDimensionsForImage(
            makeParams({ image: ["https://example.com/portrait.png"] }),
        );

        expect(resolved.width).toBe(800);
        expect(resolved.height).toBe(1200);
    });

    it("preserves a landscape source aspect ratio when size is omitted", async () => {
        mockImageFetch(makeJpeg(1536, 1024), "image/jpeg");

        const resolved = await resolveEditDimensionsForImage(
            makeParams({ image: ["https://example.com/landscape.jpg"] }),
        );

        expect(resolved.width).toBe(1536);
        expect(resolved.height).toBe(1024);
    });

    it("does not download or override when the caller explicitly passed size", async () => {
        spyOnFetch();
        const params = makeParams({
            image: ["https://example.com/portrait.png"],
            width: 512,
            height: 1024,
            dimensionsExplicit: true,
        });

        const resolved = await resolveEditDimensionsForImage(params);

        expect(resolved).toBe(params);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("falls back to the model default when the source image cannot be read", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(
            new TypeError("Network connection lost"),
        );
        const params = makeParams({
            image: ["https://example.com/broken.png"],
        });

        const resolved = await resolveEditDimensionsForImage(params);

        expect(resolved).toBe(params);
        expect(resolved.width).toBe(1024);
        expect(resolved.height).toBe(1024);
    });

    it("keeps model defaults when dimensions cannot be parsed", async () => {
        mockImageFetch(Buffer.from([1, 2, 3, 4]), "application/octet-stream");
        const params = makeParams({
            image: ["https://example.com/mystery.bin"],
        });

        const resolved = await resolveEditDimensionsForImage(params);

        expect(resolved).toBe(params);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("leaves video models untouched", async () => {
        spyOnFetch();
        const params = makeParams({
            model: "veo",
            image: ["https://example.com/first-frame.png"],
        });

        const resolved = await resolveEditDimensionsForImage(params);

        expect(resolved).toBe(params);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });
});
