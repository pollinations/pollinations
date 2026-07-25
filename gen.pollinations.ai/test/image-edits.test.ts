import { describe, expect, it } from "vitest";
import {
    getSourceImageDimensions,
} from "../src/image/utils/imageDownload.ts";

describe("getSourceImageDimensions (data URI)", () => {
    it("extracts PNG dimensions from a minimal data URI", async () => {
        const png = new Uint8Array(24);
        png[0] = 0x89;
        png[1] = 0x50;
        png[2] = 0x4e;
        png[3] = 0x47;
        new DataView(png.buffer).setUint32(16, 1920, false);
        new DataView(png.buffer).setUint32(20, 1080, false);

        const b64 = Buffer.from(png).toString("base64");
        const dims = await getSourceImageDimensions(
            `data:image/png;base64,${b64}`,
        );
        expect(dims).toEqual({ width: 1920, height: 1080 });
    });

    it("extracts JPEG dimensions from a data URI", async () => {
        const jpeg = Uint8Array.from([
            0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x02, 0xd0, 0x05, 0x00,
            0x03, 0x01, 0x11, 0x00,
        ]);
        const b64 = Buffer.from(jpeg).toString("base64");
        const dims = await getSourceImageDimensions(
            `data:image/jpeg;base64,${b64}`,
        );
        expect(dims).toEqual({ width: 1280, height: 720 });
    });

    it("extracts WEBP VP8X dimensions from a data URI", async () => {
        const webp = new Uint8Array(30);
        webp.set([0x52, 0x49, 0x46, 0x46], 0);
        webp.set([0x57, 0x45, 0x42, 0x50], 8);
        webp.set([0x56, 0x50, 0x38, 0x58], 12);
        webp[24] = 0xff;
        webp[25] = 0x03;
        webp[27] = 0xff;
        webp[28] = 0x01;

        const b64 = Buffer.from(webp).toString("base64");
        const dims = await getSourceImageDimensions(
            `data:image/webp;base64,${b64}`,
        );
        expect(dims).toEqual({ width: 1024, height: 512 });
    });

    it("returns null for unsupported input", async () => {
        const dims = await getSourceImageDimensions(
            "data:text/plain;base64,aGVsbG8=",
        );
        expect(dims).toBeNull();
    });
});
