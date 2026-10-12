import { env } from "cloudflare:test";
import { PhotonImage } from "@cf-wasm/photon";
import { describe, expect, it } from "vitest";
import { brand, getLogoPlacement } from "../src/brand.ts";

// Ported from image.pollinations.ai/test/imageOperations.test.ts
describe("Pollinations logo", () => {
    it("keeps the horizontal lockup readable without dominating normal image sizes", () => {
        const small = getLogoPlacement(512, 512);
        const medium = getLogoPlacement(1024, 1024);
        const large = getLogoPlacement(2048, 2048);

        expect(small.height).toBe(16);
        expect(medium.height).toBe(26);
        expect(large.height).toBe(28);
        expect(small.width / 512).toBeLessThan(0.26);
        expect(medium.width / 1024).toBeLessThan(0.26);
        expect(large.width / 2048).toBeLessThan(0.26);
    });

    it("keeps the wordmark readable on unusually narrow images", () => {
        const placement = getLogoPlacement(256, 768);

        expect(placement.height).toBe(16);
    });

    it("places the 768x768 logo where the VM did", () => {
        expect(getLogoPlacement(768, 768)).toEqual({
            width: 154,
            height: 19,
            left: 602,
            top: 737,
            outline: 1,
        });
    });
});

/** The fixture JPEG the test gen returns for a prompt */
const genImage = async (prompt: string) =>
    new Uint8Array(
        await (
            await env.GEN.fetch(`https://gen.pollinations.ai/image/${prompt}`)
        ).arrayBuffer(),
    );

const METADATA = {
    prompt: "a café",
    originalPrompt: "a café",
    width: 768,
    model: "sana",
    isMature: false,
};

/** Counts the pixels of a box that are near white and near black */
function tones(
    image: PhotonImage,
    box: { left: number; top: number; width: number; height: number },
) {
    const pixels = image.get_raw_pixels();
    const width = image.get_width();
    let white = 0;
    let black = 0;
    for (let y = box.top; y < box.top + box.height; y++) {
        for (let x = box.left; x < box.left + box.width; x++) {
            const i = (y * width + x) * 4;
            const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
            if (r > 235 && g > 235 && b > 235) white++;
            if (r < 40 && g < 40 && b < 40) black++;
        }
    }
    return { white, black };
}

const SIZES = { 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };

/**
 * The entries of a JPEG's Exif segment, read from its little-endian TIFF:
 * "<IFD>:<tag hex>" -> value bytes
 */
function exifEntries(jpeg: Uint8Array) {
    expect([...jpeg.subarray(2, 4)]).toEqual([0xff, 0xe1]);
    const tiff = jpeg.subarray(12);
    const view = new DataView(tiff.buffer, tiff.byteOffset);
    const entries = new Map<string, Uint8Array>();
    const read = (name: string, at: number) => {
        for (let i = 0; i < view.getUint16(at, true); i++) {
            const entry = at + 2 + 12 * i;
            const tag = view.getUint16(entry, true);
            const size =
                SIZES[view.getUint16(entry + 2, true)] *
                view.getUint32(entry + 4, true);
            const offset =
                size > 4 ? view.getUint32(entry + 8, true) : entry + 8;
            entries.set(
                `${name}:${tag.toString(16)}`,
                tiff.subarray(offset, offset + size),
            );
            if (tag === 0x8769) read("Exif", view.getUint32(entry + 8, true));
        }
    };
    read("IFD0", view.getUint32(4, true));
    return entries;
}

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe("brand", () => {
    for (const [input, prompt] of [
        [512, "fixture"],
        [1024, "gen:1024"],
    ] as const) {
        for (const [width, height] of [
            [768, 768],
            [1024, 576],
            [512, 512],
        ]) {
            it(`makes a ${input}² image a ${width}x${height} JPEG with the outlined logo and the EXIF`, async () => {
                const jpeg = brand(
                    await genImage(prompt),
                    width,
                    height,
                    METADATA,
                );

                // A JPEG of exactly the asked size
                expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
                const image = PhotonImage.new_from_byteslice(jpeg);
                try {
                    expect([image.get_width(), image.get_height()]).toEqual([
                        width,
                        height,
                    ]);
                    // The white lockup and its black outline inside the
                    // logo box, neither in the same box at the top left
                    const placement = getLogoPlacement(width, height);
                    const box = {
                        left: placement.left - placement.outline,
                        top: placement.top - placement.outline,
                        width: placement.width + 2 * placement.outline,
                        height: placement.height + 2 * placement.outline,
                    };
                    const logo = tones(image, box);
                    expect(logo.white).toBeGreaterThan(50);
                    expect(logo.black).toBeGreaterThan(50);
                    expect(tones(image, { ...box, left: 0, top: 0 })).toEqual({
                        white: 0,
                        black: 0,
                    });
                } finally {
                    image.free();
                }

                // The VM's tags: Make and UserComment ("ASCII", three NULs,
                // the JSON in GLib's ASCII) in IFD0, the pixel size in the
                // Exif IFD
                const exif = exifEntries(jpeg);
                expect([...exif.keys()]).toEqual([
                    "IFD0:10f",
                    "IFD0:112",
                    "IFD0:11a",
                    "IFD0:11b",
                    "IFD0:128",
                    "IFD0:213",
                    "IFD0:8769",
                    "Exif:9000",
                    "Exif:9101",
                    "Exif:a000",
                    "Exif:a001",
                    "Exif:a002",
                    "Exif:a003",
                    "IFD0:9286",
                ]);
                expect(text(exif.get("IFD0:10f"))).toBe("sana\0");
                expect(text(exif.get("IFD0:9286"))).toBe(
                    `ASCII\0\0\0${JSON.stringify(METADATA).replaceAll("é", "e")}`,
                );
                const size = new DataView(
                    new Uint8Array([
                        ...exif.get("Exif:a002"),
                        ...exif.get("Exif:a003"),
                    ]).buffer,
                );
                expect([
                    size.getUint32(0, true),
                    size.getUint32(4, true),
                ]).toEqual([width, height]);
            });
        }
    }

    it("throws sharp's errors for a body that is not an image and for a size sharp rejects", async () => {
        const page = new TextEncoder().encode("<html>not an image</html>");
        expect(() => brand(page, 512, 512, METADATA)).toThrow(
            "Input buffer contains unsupported image format",
        );
        const image = await genImage("fixture");
        expect(() => brand(image, 0, 512, METADATA)).toThrow(
            "Expected positive integer for width but received 0 of type number",
        );
        expect(() => brand(image, 512, Number.NaN, METADATA)).toThrow(
            "Expected positive integer for height but received NaN of type number",
        );
        // photon still works afterwards
        expect(brand(image, 64, 64, METADATA).byteLength).toBeGreaterThan(0);
    });
});
