import { load, TagValues } from "piexif-ts";
import { describe, expect, it } from "vitest";
import { writeExifMetadata } from "../../src/image/writeExifMetadata.ts";

// 1x1 white JPEG (base64 encoded), minimum valid input piexif's segment parser accepts.
const MINIMAL_JPEG = Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH8AP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Af//Z",
    "base64",
);

describe("writeExifMetadata", () => {
    it("writes Make and UserComment to a JPEG", async () => {
        const params = { model: "flux", prompt: "a cat", width: 512 };
        const maturity = { isMature: false, isChild: false };

        const out = await writeExifMetadata(MINIMAL_JPEG, params, maturity);

        let bin = "";
        for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
        const exif = load(bin);

        expect(exif["0th"]?.[TagValues.ImageIFD.Make]).toBe("flux");
        const userComment = exif.Exif?.[
            TagValues.ExifIFD.UserComment
        ] as string;
        expect(userComment).toBeTruthy();
        expect(JSON.parse(userComment)).toMatchObject({
            model: "flux",
            prompt: "a cat",
            isMature: false,
        });
    });

    it("returns the original buffer for non-JPEG input", async () => {
        const png = Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
        const out = await writeExifMetadata(png, { model: "x" }, {});
        expect(out).toEqual(png);
    });
});
