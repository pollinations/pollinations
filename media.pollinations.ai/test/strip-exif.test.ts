import { fetchMock, SELF } from "cloudflare:test";
import { removeMetadata } from "picscrub";
import { beforeAll, describe, expect, it } from "vitest";

// 1x1 white JPEG baseline
const MINIMAL_JPEG = new Uint8Array(
    Buffer.from(
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH8AP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Af//Z",
        "base64",
    ),
);

// APP1 EXIF segment (0xFFE1) with 'Exif\0\0' header and minimal TIFF structure
const EXIF_SEGMENT = new Uint8Array([
    0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49,
    0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
]);

// Splice segment right after SOI (FF D8)
const JPEG_WITH_EXIF = new Uint8Array(
    Buffer.concat([
        MINIMAL_JPEG.subarray(0, 2),
        EXIF_SEGMENT,
        MINIMAL_JPEG.subarray(2),
    ]),
);

describe("media upload metadata stripping", () => {
    beforeAll(() => {
        fetchMock.activate();
        fetchMock.disableNetConnect();
        fetchMock
            .get("https://gen.pollinations.ai")
            .intercept({ path: "/account/key" })
            .reply(200, {
                valid: true,
                type: "publishable",
                name: "test-user",
                userId: "user_test",
                byopApp: null,
            })
            .persist();
    });

    it("picscrub removes EXIF from JPEG bytes directly", async () => {
        const result = await removeMetadata(JPEG_WITH_EXIF, {
            preserveOrientation: true,
            preserveColorProfile: true,
        });
        expect(result.removedMetadata).toContain("EXIF");
        expect(result.cleanedSize).toBeLessThan(JPEG_WITH_EXIF.byteLength);
    });

    it("strips EXIF metadata by default on multipart form upload", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([JPEG_WITH_EXIF], "photo.jpg", { type: "image/jpeg" }),
        );

        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: "Bearer test-key" },
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as { id: string; size: number };
        expect(data.size).toBeLessThan(JPEG_WITH_EXIF.byteLength);

        // Fetch back from storage to verify the stored object has metadata stripped
        const getRes = await SELF.fetch(
            `https://media.pollinations.ai/${data.id}`,
        );
        expect(getRes.status).toBe(200);
        const storedBytes = new Uint8Array(await getRes.arrayBuffer());
        expect(storedBytes.byteLength).toBe(data.size);

        // Running removeMetadata on the stored image should find no EXIF to strip
        const checkResult = await removeMetadata(storedBytes);
        expect(checkResult.removedMetadata).not.toContain("EXIF");
    });

    it("strips EXIF metadata on base64 JSON upload", async () => {
        const base64Data = Buffer.from(JPEG_WITH_EXIF).toString("base64");
        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            headers: {
                Authorization: "Bearer test-key",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                data: `data:image/jpeg;base64,${base64Data}`,
                contentType: "image/jpeg",
                name: "photo.jpg",
            }),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as { id: string; size: number };
        expect(data.size).toBeLessThan(JPEG_WITH_EXIF.byteLength);
    });

    it("preserves metadata when preserve_metadata=true is supplied", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([JPEG_WITH_EXIF], "photo.jpg", { type: "image/jpeg" }),
        );

        const res = await SELF.fetch(
            "https://media.pollinations.ai/upload?preserve_metadata=true",
            {
                method: "POST",
                body: form,
                headers: { Authorization: "Bearer test-key" },
            },
        );

        expect(res.status).toBe(200);
        const data = (await res.json()) as { id: string; size: number };
        expect(data.size).toBe(JPEG_WITH_EXIF.byteLength);
    });

    it("gracefully stores non-image and unparseable media without failing", async () => {
        const textPayload = new TextEncoder().encode("Hello, World!");
        const form = new FormData();
        form.append(
            "file",
            new File([textPayload], "doc.txt", { type: "text/plain" }),
        );

        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: "Bearer test-key" },
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as { id: string; size: number };
        expect(data.size).toBe(textPayload.byteLength);
    });
});
