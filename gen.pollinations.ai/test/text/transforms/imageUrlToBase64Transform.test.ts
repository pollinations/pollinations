import { afterEach, describe, expect, it, vi } from "vitest";
import { imageUrlToBase64Transform } from "../../../src/text/transforms/imageUrlToBase64Transform.js";

const transform = imageUrlToBase64Transform;
const bedrockOptions = { modelConfig: { provider: "bedrock" } };

/** PNG signature — enough for the media type to be read off the bytes. */
const PNG_BYTES = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

afterEach(() => {
    vi.restoreAllMocks();
});

function imageMessage(urls: string[]) {
    return [
        {
            role: "user",
            content: urls.map((url) => ({
                type: "image_url",
                image_url: { url },
            })),
        },
    ];
}

describe("imageUrlToBase64Transform", () => {
    it("rejects malformed image URLs before they reach the provider", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            transform(imageMessage(["not-a-url"]), bedrockOptions),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "invalid_image_url",
        });

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects localhost and literal IP image URLs before fetch", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            transform(
                imageMessage(["http://127.0.0.1/image.png"]),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "invalid_image_url",
        });
        await expect(
            transform(
                imageMessage(["http://93.184.216.34/image.png"]),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "invalid_image_url",
        });
        await expect(
            transform(
                imageMessage([
                    "http://[2606:2800:220:1:248:1893:25c8:1946]/image.png",
                ]),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "invalid_image_url",
        });
        await expect(
            transform(
                imageMessage(["http://localhost/image.png"]),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "invalid_image_url",
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("does not follow redirects when fetching images", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(null, {
                status: 302,
                headers: { location: "http://127.0.0.1/image.png" },
            }),
        );

        await expect(
            transform(
                imageMessage(["https://example.com/redirect.png"]),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "invalid_image_url",
        });

        expect(fetchSpy).toHaveBeenCalledWith(
            new URL("https://example.com/redirect.png"),
            expect.objectContaining({ redirect: "manual" }),
        );
    });

    it("caps converted image URLs per request", async () => {
        // A fresh Response per call: a single shared one has its body consumed
        // by the first read, and the media type is now taken from the bytes, so
        // later images would fail as unreadable before reaching the count cap
        // this test is about.
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async () =>
                new Response(PNG_BYTES, {
                    headers: { "content-type": "image/png" },
                }),
        );

        await expect(
            transform(
                imageMessage(
                    Array.from(
                        { length: 9 },
                        (_, index) => `https://example.com/${index}.png`,
                    ),
                ),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "image_too_large",
        });
    });

    it.each([
        401, 403, 404, 429, 500,
    ])("returns 400 failed_to_download_image when the image host answers %i", async (upstreamStatus) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("nope", { status: upstreamStatus }),
        );

        await expect(
            transform(
                imageMessage(["https://example.com/image.png"]),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "failed_to_download_image",
            upstreamStatus,
        });
    });

    // Not our call to make: the type is relayed and the provider answers. It
    // gives a better error about its own accepted formats than a guess here.
    it("relays a non-image content type instead of refusing it", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("<html></html>", {
                headers: { "content-type": "text/html" },
            }),
        );

        const { messages } = await transform(
            imageMessage(["https://example.com/page.html"]),
            bedrockOptions,
        );

        const [part] = (
            messages[0] as { content: { image_url: { url: string } }[] }
        ).content;
        expect(part.image_url.url).toMatch(/^data:text\/html;base64,/);
    });

    it("rejects an image larger than the request budget", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: {
                    "content-type": "image/png",
                    "content-length": String(21 * 1024 * 1024),
                },
            }),
        );

        await expect(
            transform(
                imageMessage(["https://example.com/huge.png"]),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "image_too_large",
        });
    });
});
