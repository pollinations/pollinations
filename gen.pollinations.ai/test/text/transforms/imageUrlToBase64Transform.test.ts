import { afterEach, describe, expect, it, vi } from "vitest";
import { createImageUrlToBase64Transform } from "../../../src/text/transforms/imageUrlToBase64Transform.js";

const transform = createImageUrlToBase64Transform();
const bedrockOptions = { modelConfig: { provider: "bedrock" } };

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
    it("rejects localhost and literal IP image URLs before fetch", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            transform(
                imageMessage(["http://127.0.0.1/image.png"]),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            transform(
                imageMessage(["http://93.184.216.34/image.png"]),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            transform(
                imageMessage([
                    "http://[2606:2800:220:1:248:1893:25c8:1946]/image.png",
                ]),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            transform(
                imageMessage(["http://localhost/image.png"]),
                bedrockOptions,
            ),
        ).rejects.toMatchObject({ status: 400 });
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
        ).rejects.toMatchObject({ status: 400 });

        expect(fetchSpy).toHaveBeenCalledWith(
            new URL("https://example.com/redirect.png"),
            expect.objectContaining({ redirect: "manual" }),
        );
    });

    it("caps converted image URLs per request", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
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
        ).rejects.toMatchObject({ status: 400 });
    });
});
