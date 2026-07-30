import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../src/image/httpError.ts";
import {
    downloadUserImage,
    readImageDimensions,
} from "../../src/image/utils/imageDownload.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("downloadUserImage", () => {
    it("codes a body that disconnects mid-read as failed_to_download_image", async () => {
        const imageUrl = "https://example.com/input.png";
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array([137, 80, 78, 71]));
                controller.error(new TypeError("Network connection lost"));
            },
        });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(body, { status: 200 }),
        );

        const error = await downloadUserImage(imageUrl).catch((cause) => cause);

        expect(error).toBeInstanceOf(HttpError);
        expect(error).toMatchObject({
            status: 400,
            details: { validation: true },
            errorCode: "failed_to_download_image",
            message: `Failed to read image ${imageUrl}: Network connection lost`,
        });
    });

    it("rejects a successful response whose body is not an image", async () => {
        const imageUrl = "https://example.com/input.jpg";
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("<html>not an image</html>", { status: 200 }),
        );

        await expect(downloadUserImage(imageUrl)).rejects.toMatchObject({
            name: "UserImageError",
            status: 400,
            details: { validation: true },
            errorCode: "unsupported_image_media_type",
            message: `Unsupported image format from ${imageUrl}. Supported formats: PNG, JPEG, WebP, GIF, BMP.`,
        });
    });

    it("codes an unreachable image host as failed_to_download_image", async () => {
        const imageUrl = "https://example.com/gone.png";
        vi.spyOn(globalThis, "fetch").mockRejectedValue(
            new TypeError("fetch failed"),
        );

        await expect(downloadUserImage(imageUrl)).rejects.toMatchObject({
            status: 400,
            errorCode: "failed_to_download_image",
        });
    });

    it("codes a non-2xx image host response as failed_to_download_image", async () => {
        const imageUrl = "https://example.com/missing.png";
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("nope", { status: 404, statusText: "Not Found" }),
        );

        await expect(downloadUserImage(imageUrl)).rejects.toMatchObject({
            status: 400,
            errorCode: "failed_to_download_image",
        });
    });

    // The generation path reaches the same guard the text path uses, so a URL
    // refused there cannot be reached through an image request instead.
    it.each([
        "http://localhost/image.png",
        "http://127.0.0.1/image.png",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/image.png",
        "https://user:pass@example.com/image.png",
        "file:///etc/passwd",
    ])("refuses %s before any fetch", async (imageUrl) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(downloadUserImage(imageUrl)).rejects.toMatchObject({
            status: 400,
            errorCode: "invalid_image_url",
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("stops reading an image that streams past the size cap", async () => {
        // Never completes: the cap has to end this, not the end of the body.
        const endless = new ReadableStream({
            pull(controller) {
                controller.enqueue(new Uint8Array(1024 * 1024));
            },
        });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(endless, { status: 200 }),
        );

        await expect(
            downloadUserImage("https://example.com/endless.png"),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "image_too_large",
        });
    });

    it("accepts an uploaded image as a data URI without fetching", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        const { buffer, mimeType } = await downloadUserImage(
            "data:image/png;base64,iVBORw0KGgo=",
        );

        expect(mimeType).toBe("image/png");
        expect([...buffer]).toEqual([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("types an upload by its bytes, not by the type it declares", async () => {
        await expect(
            downloadUserImage("data:image/png;base64,bm90LWFuLWltYWdl"),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "unsupported_image_media_type",
        });
    });
});

describe("readImageDimensions", () => {
    it("reads every accepted raster format", () => {
        const png = Buffer.alloc(24);
        png.set([0x89, 0x50, 0x4e, 0x47]);
        png.writeUInt32BE(2560, 16);
        png.writeUInt32BE(1440, 20);

        const gif = Buffer.alloc(10);
        gif.write("GIF89a", 0, "ascii");
        gif.writeUInt16LE(640, 6);
        gif.writeUInt16LE(480, 8);

        const bmp = Buffer.alloc(26);
        bmp.write("BM", 0, "ascii");
        bmp.writeInt32LE(800, 18);
        bmp.writeInt32LE(-600, 22);

        const webp = Buffer.alloc(30);
        webp.write("RIFF", 0, "ascii");
        webp.write("WEBP", 8, "ascii");
        webp.write("VP8X", 12, "ascii");
        webp[24] = 0xff;
        webp[25] = 0x03;
        webp[27] = 0xff;
        webp[28] = 0x01;

        const jpeg = Buffer.from([
            0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x02, 0xd0, 0x05, 0x00,
            0x03, 0x01, 0x11, 0x00,
        ]);

        expect(readImageDimensions(png, "image/png")).toEqual({
            width: 2560,
            height: 1440,
        });
        expect(readImageDimensions(gif, "image/gif")).toEqual({
            width: 640,
            height: 480,
        });
        expect(readImageDimensions(bmp, "image/bmp")).toEqual({
            width: 800,
            height: 600,
        });
        expect(readImageDimensions(webp, "image/webp")).toEqual({
            width: 1024,
            height: 512,
        });
        expect(readImageDimensions(jpeg, "image/jpeg")).toEqual({
            width: 1280,
            height: 720,
        });
    });
});
