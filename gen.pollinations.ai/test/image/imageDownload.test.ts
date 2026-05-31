import { afterEach, describe, expect, test, vi } from "vitest";
import type { HttpError } from "../../src/image/httpError.ts";
import { downloadUserImage } from "../../src/image/utils/imageDownload.ts";

describe("downloadUserImage", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("rejects private image URLs before fetching", async () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);

        await expect(
            downloadUserImage("http://169.254.169.254/latest/meta-data/"),
        ).rejects.toMatchObject({
            status: 400,
            details: { validation: true },
        } satisfies Partial<HttpError>);
        expect(fetch).not.toHaveBeenCalled();
    });

    test("fetches public image URLs without following redirects", async () => {
        const fetch = vi.fn(async () => {
            return new Response(
                new Uint8Array([
                    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                ]),
                {
                    headers: { "content-type": "image/png" },
                },
            );
        });
        vi.stubGlobal("fetch", fetch);

        const result = await downloadUserImage("https://example.com/image.png");

        expect(result.mimeType).toBe("image/png");
        expect(fetch).toHaveBeenCalledWith(
            new URL("https://example.com/image.png"),
            {
                redirect: "manual",
                signal: undefined,
            },
        );
    });
});
