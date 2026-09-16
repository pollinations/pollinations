import { UpstreamError } from "@shared/error.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    downloadUserImage,
    readImageDimensions,
    toDataUri,
} from "../../src/image/utils/imageDownload.ts";
import { MAX_IMAGE_SIZE } from "../../src/userImage.ts";

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

        expect(error).toBeInstanceOf(UpstreamError);
        expect(error).toMatchObject({
            status: 400,
            requestUrl: new URL(imageUrl),
            errorCode: "failed_to_download_image",
            message: `Failed to read image ${imageUrl}: Network connection lost`,
        });
    });

    // Whether a type is usable is the provider's answer to give. Relaying it
    // gets a better error than guessing from here would.
    it("relays a declared type even when it is not an image type", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("<html>not an image</html>", {
                status: 200,
                headers: { "content-type": "text/html" },
            }),
        );

        const { mimeType } = await downloadUserImage(
            "https://example.com/page.html",
        );

        expect(mimeType).toBe("text/html");
    });

    it("rejects only when nothing is declared and nothing is recognisable", async () => {
        const imageUrl = "https://example.com/mystery";
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
        );

        await expect(downloadUserImage(imageUrl)).rejects.toMatchObject({
            name: "UserImageError",
            status: 400,
            requestUrl: new URL(imageUrl),
            errorCode: "unsupported_image_media_type",
        });
    });

    // The detector knows five formats; providers accept more. Whether an image
    // in some other format is usable is the provider's call, so a declared
    // image type is forwarded rather than refused here.
    it("forwards a declared image type the detector does not recognise", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]),
                {
                    status: 200,
                    headers: { "content-type": "image/heic" },
                },
            ),
        );

        const { mimeType } = await downloadUserImage(
            "https://example.com/photo.heic",
        );

        expect(mimeType).toBe("image/heic");
    });

    // Reading the bytes is the last resort, for hosts that declare nothing at
    // all — something has to be sent, since inlineData and data: URIs both
    // require a type.
    it("reads the bytes only when the host declares no type at all", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                new Uint8Array([
                    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                ]),
                { status: 200 },
            ),
        );

        const { mimeType } = await downloadUserImage(
            "https://example.com/untyped",
        );

        expect(mimeType).toBe("image/png");
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

    it("rejects an upload that declares no type and is not recognisable", async () => {
        await expect(
            downloadUserImage("data:;base64,bm90LWFuLWltYWdl"),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "unsupported_image_media_type",
        });
    });
});

describe("toDataUri", () => {
    it.each([
        "data:image/png;base64,iVBORw0KGgo=",
        "data:image/heic;base64,AA==",
        "data:text/html;base64,YWJj",
        "data:image/png;base64,",
        "data:IMAGE/PNG;base64,iVBORw0KGgo=",
        "data:image/png;BASE64,iVBORw0KGgo=",
        "data:image/png;base64, iVBORw0K\nGgo ",
        "data:image/png;base64,Zh==",
        "data:image/png;base64,YWJj\n",
        "data:;base64,iVBORw0KGgo=",
    ])("preserves decoded bytes and MIME normalization for %s", async (uri) => {
        const { buffer, mimeType } = await downloadUserImage(uri);
        expect(await toDataUri(uri)).toBe(
            `data:${mimeType};base64,${buffer.toString("base64")}`,
        );
    });

    it.each([
        "data:image/png,abc",
        "data:image/png;base64,A===",
        "data:image/png;base64,A",
        "data:image/png;base64,AA=A",
        "data:image/png;base64,AA-_",
        "data:image/png;base64,!!!!",
    ])("keeps invalid base64 a caller error: %s", async (uri) => {
        await expect(toDataUri(uri)).rejects.toMatchObject({
            status: 400,
            errorCode: "invalid_image_url",
        });
    });

    it("keeps untyped unrecognisable data a caller error", async () => {
        await expect(toDataUri("data:;base64,YWJj")).rejects.toMatchObject({
            status: 400,
            errorCode: "unsupported_image_media_type",
        });
    });

    it("reuses two large uploaded images without decoding their full payloads", async () => {
        const inputs = [9_992_143, 12_285_506].map((size) => {
            const bytes = Buffer.alloc(size);
            bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            return `data:image/png;base64,${bytes.toString("base64")}`;
        });
        const decode = vi.spyOn(globalThis, "atob");
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        const output = await Promise.all(inputs.map(toDataUri));

        expect(output).toEqual(inputs);
        expect(decode.mock.calls.every(([input]) => input.length <= 4)).toBe(
            true,
        );
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("keeps the per-image size limit without decoding an oversized upload", async () => {
        const uri = `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_SIZE + 1).toString("base64")}`;
        const decode = vi.spyOn(globalThis, "atob");
        await expect(toDataUri(uri)).rejects.toMatchObject({
            status: 400,
            errorCode: "image_too_large",
        });
        expect(decode.mock.calls.every(([input]) => input.length <= 4)).toBe(
            true,
        );
    });

    it("still downloads remote images", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "image/png" },
            }),
        );
        expect(await toDataUri("https://example.com/input.png")).toBe(
            "data:image/png;base64,AQID",
        );
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
