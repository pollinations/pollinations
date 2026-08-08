import { Buffer } from "node:buffer";
import {
    CreateImageEditRequestSchema,
    CreateImageRequestSchema,
} from "@shared/schemas/openai.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    inferSizeFromSourceImage,
    scaleToSupportedSize,
} from "../../src/image/utils/sourceDimensions.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

// --- Test image builders (headers only — dimension parsing never needs pixels) ---

function pngBuffer(width: number, height: number): Buffer {
    const buffer = Buffer.alloc(24);
    buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
}

function jpegBuffer(width: number, height: number): Buffer {
    const buffer = Buffer.alloc(21);
    buffer.set([0xff, 0xd8, 0xff]);
    buffer[2] = 0xff;
    buffer[3] = 0xc0; // SOF0
    buffer.writeUInt16BE(17, 4); // segment length
    buffer.writeUInt16BE(height, 7);
    buffer.writeUInt16BE(width, 9);
    return buffer;
}

function webpBuffer(width: number, height: number): Buffer {
    const buffer = Buffer.alloc(30);
    buffer.write("RIFF", 0, "ascii");
    buffer.write("WEBP", 8, "ascii");
    buffer.write("VP8X", 12, "ascii");
    buffer.writeUIntLE(width - 1, 24, 3);
    buffer.writeUIntLE(height - 1, 27, 3);
    return buffer;
}

function toDataUri(buffer: Buffer, mimeType = "image/png"): string {
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

// --- scaleToSupportedSize ---

describe("scaleToSupportedSize", () => {
    it("keeps 16px-aligned dimensions untouched", () => {
        expect(scaleToSupportedSize(768, 1344)).toBe("768x1344");
        expect(scaleToSupportedSize(2048, 1152)).toBe("2048x1152");
    });

    it("snaps unaligned dimensions to 16px multiples", () => {
        expect(scaleToSupportedSize(1000, 750)).toBe("1008x752");
    });

    it("clamps the long edge to 4096 while preserving aspect", () => {
        expect(scaleToSupportedSize(8192, 4096)).toBe("4096x2048");
        expect(scaleToSupportedSize(4000, 8000)).toBe("2048x4096");
    });

    it("floors tiny edges at the 16px grid minimum", () => {
        expect(scaleToSupportedSize(4, 4)).toBe("16x16");
    });

    it("rejects non-positive or non-finite dimensions", () => {
        expect(scaleToSupportedSize(0, 512)).toBeUndefined();
        expect(scaleToSupportedSize(512, -1)).toBeUndefined();
        expect(scaleToSupportedSize(Number.NaN, 512)).toBeUndefined();
        expect(
            scaleToSupportedSize(Number.POSITIVE_INFINITY, 512),
        ).toBeUndefined();
    });
});

// --- inferSizeFromSourceImage ---

describe("inferSizeFromSourceImage", () => {
    it("derives a portrait size from a PNG data URI", async () => {
        const size = await inferSizeFromSourceImage([
            toDataUri(pngBuffer(768, 1344)),
        ]);
        expect(size).toBe("768x1344");
    });

    it("derives a landscape size from a JPEG data URI", async () => {
        const size = await inferSizeFromSourceImage([
            toDataUri(jpegBuffer(1600, 900), "image/jpeg"),
        ]);
        expect(size).toBe("1600x896");
    });

    it("derives dimensions from a WEBP data URI", async () => {
        const size = await inferSizeFromSourceImage([
            toDataUri(webpBuffer(1024, 1792), "image/webp"),
        ]);
        expect(size).toBe("1024x1792");
    });

    it("trusts image bytes over a mismatched declared media type", async () => {
        // PNG bytes labeled as JPEG — sniffing must win.
        const size = await inferSizeFromSourceImage([
            toDataUri(pngBuffer(640, 1280), "image/jpeg"),
        ]);
        expect(size).toBe("640x1280");
    });

    it("downloads remote URLs and reads their dimensions", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array(pngBuffer(2048, 1152)), {
                status: 200,
            }),
        );
        const size = await inferSizeFromSourceImage([
            "https://example.com/landscape.png",
        ]);
        expect(size).toBe("2048x1152");
    });

    it("scales oversized sources down to the 4096 edge cap", async () => {
        const size = await inferSizeFromSourceImage([
            toDataUri(pngBuffer(8192, 4096)),
        ]);
        expect(size).toBe("4096x2048");
    });

    it("uses only the first source image", async () => {
        const size = await inferSizeFromSourceImage([
            toDataUri(pngBuffer(512, 1024)),
            toDataUri(pngBuffer(1024, 512)),
        ]);
        expect(size).toBe("512x1024");
    });

    it("returns undefined when the image list is empty", async () => {
        expect(await inferSizeFromSourceImage([])).toBeUndefined();
    });

    it("returns undefined for undetectable image bytes", async () => {
        const notAnImage = Buffer.from("just some text", "utf8");
        expect(
            await inferSizeFromSourceImage([toDataUri(notAnImage)]),
        ).toBeUndefined();
    });

    it("returns undefined instead of throwing on malformed data URIs", async () => {
        expect(
            await inferSizeFromSourceImage(["data:image/png;base64,@@!!"]),
        ).toBeUndefined();
    });

    it("returns undefined instead of throwing when the download fails", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("not found", { status: 404 }),
        );
        expect(
            await inferSizeFromSourceImage(["https://example.com/gone.png"]),
        ).toBeUndefined();
    });
});

// --- Request schema contract ---

describe("CreateImageEditRequestSchema size handling", () => {
    it("no longer injects a square default when size is omitted", () => {
        const parsed = CreateImageEditRequestSchema.parse({
            prompt: "make it blue",
            image: "https://example.com/source.png",
        });
        expect(parsed.size).toBeUndefined();
    });

    it("keeps an explicit size untouched", () => {
        const parsed = CreateImageEditRequestSchema.parse({
            prompt: "make it blue",
            image: "https://example.com/source.png",
            size: "512x768",
        });
        expect(parsed.size).toBe("512x768");
    });

    it("leaves the generation schema default unchanged", () => {
        const parsed = CreateImageRequestSchema.parse({
            prompt: "a bee",
        });
        expect(parsed.size).toBe("1024x1024");
    });
});
