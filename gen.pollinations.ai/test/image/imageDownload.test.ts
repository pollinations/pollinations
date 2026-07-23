import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../src/image/httpError.ts";
import { downloadUserImage } from "../../src/image/utils/imageDownload.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("downloadUserImage", () => {
    it("returns a validation error when the response body disconnects", async () => {
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

        expect(error).toBeInstanceOf(HttpError);
        expect(error).toMatchObject({
            status: 400,
            details: { validation: true },
            message: `Failed to read image ${imageUrl}: Network connection lost`,
        });
    });

    it("rejects a successful response whose body is not an image", async () => {
        const imageUrl = "https://example.com/input.jpg";
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("<html>not an image</html>", { status: 200 }),
        );

        await expect(downloadUserImage(imageUrl)).rejects.toMatchObject({
            name: "HttpError",
            status: 400,
            details: { validation: true },
            message: `Unsupported image format from ${imageUrl}`,
        });
    });
});
