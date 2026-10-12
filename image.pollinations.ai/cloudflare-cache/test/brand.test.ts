import { env } from "cloudflare:test";
import { PhotonImage } from "@cf-wasm/photon";
import { load, TagValues } from "piexif-ts/dist/piexif.js";
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

/** The bytes as the binary string piexif-ts reads */
const binary = (bytes: Uint8Array) =>
    Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

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

                // Make, and the UserComment the VM wrote: "ASCII", three
                // NULs, the JSON in UTF-8
                const exif = load(binary(jpeg));
                expect(exif["0th"][TagValues.ImageIFD.Make]).toBe("sana");
                const comment = exif.Exif[TagValues.ExifIFD.UserComment];
                expect(comment.slice(0, 8)).toBe("ASCII\0\0\0");
                const bytes = Uint8Array.from(
                    comment.slice(8),
                    (char: string) => char.charCodeAt(0),
                );
                expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual(
                    METADATA,
                );
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
