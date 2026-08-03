import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
    addPollinationsLogo,
    getLogoPlacement,
} from "../src/imageOperations.ts";

describe("Pollinations logo", () => {
    it("keeps the horizontal lockup below 25% of a typical image width", () => {
        const small = getLogoPlacement(512, 512);
        const medium = getLogoPlacement(1024, 1024);
        const large = getLogoPlacement(2048, 2048);

        expect(small.height).toBe(14);
        expect(medium.height).toBe(26);
        expect(large.height).toBe(28);
        expect(small.width / 512).toBeLessThan(0.25);
        expect(medium.width / 1024).toBeLessThan(0.25);
        expect(large.width / 2048).toBeLessThan(0.25);
    });

    it.each([
        "white",
        "black",
    ])("is visible on a %s background without changing image dimensions", async (background) => {
        const width = 512;
        const height = 512;
        const source = await sharp({
            create: {
                width,
                height,
                channels: 3,
                background,
            },
        })
            .png()
            .toBuffer();

        const branded = await addPollinationsLogo(source);
        const metadata = await sharp(branded).metadata();
        const placement = getLogoPlacement(width, height);
        const logoStats = await sharp(branded)
            .extract({
                left: placement.left - placement.outline,
                top: placement.top - placement.outline,
                width: placement.width + placement.outline * 2,
                height: placement.height + placement.outline * 2,
            })
            .stats();

        expect(metadata.width).toBe(width);
        expect(metadata.height).toBe(height);
        expect(
            Math.min(...logoStats.channels.map(({ min }) => min)),
        ).toBeLessThan(16);
        expect(Math.max(...logoStats.channels.map(({ max }) => max))).toBe(255);
    });
});
