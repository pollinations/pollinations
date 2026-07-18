import { afterEach, describe, expect, test, vi } from "vitest";
import type { HttpError } from "../../src/image/httpError.ts";
import { downloadUserImage } from "../../src/image/utils/imageDownload.ts";

describe("downloadUserImage", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("rejects localhost image URLs before fetching", async () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);

        await expect(
            downloadUserImage("http://localhost:8787/internal.png"),
        ).rejects.toMatchObject({
            status: 400,
            details: { validation: true },
        } satisfies Partial<HttpError>);
        expect(fetch).not.toHaveBeenCalled();
    });

    test("fetches public image URLs with manual redirect handling", async () => {
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

    test("follows bounded redirects to public image URLs", async () => {
        const fetch = vi.fn(async (url: URL) => {
            if (url.toString() === "https://example.com/redirect.png") {
                return new Response(null, {
                    status: 302,
                    headers: {
                        location: "https://cdn.example.com/final.png",
                    },
                });
            }
            return new Response(
                new Uint8Array([
                    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                ]),
                { headers: { "content-type": "image/png" } },
            );
        });
        vi.stubGlobal("fetch", fetch);

        const result = await downloadUserImage(
            "https://example.com/redirect.png",
        );

        expect(result.mimeType).toBe("image/png");
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenLastCalledWith(
            new URL("https://cdn.example.com/final.png"),
            {
                redirect: "manual",
                signal: undefined,
            },
        );
    });

    test("rejects redirects to disallowed media URLs", async () => {
        const fetch = vi.fn(async () => {
            return new Response(null, {
                status: 302,
                headers: { location: "http://localhost/internal.png" },
            });
        });
        vi.stubGlobal("fetch", fetch);

        await expect(
            downloadUserImage("https://example.com/redirect.png"),
        ).rejects.toMatchObject({
            status: 400,
            details: { validation: true },
        } satisfies Partial<HttpError>);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test("rejects redirect chains beyond the cap", async () => {
        const fetch = vi.fn(async (url: URL) => {
            const count = Number(url.searchParams.get("n") || "0");
            return new Response(null, {
                status: 302,
                headers: {
                    location: `https://example.com/redirect.png?n=${count + 1}`,
                },
            });
        });
        vi.stubGlobal("fetch", fetch);

        await expect(
            downloadUserImage("https://example.com/redirect.png"),
        ).rejects.toMatchObject({
            status: 400,
            details: { validation: true },
        } satisfies Partial<HttpError>);
        expect(fetch).toHaveBeenCalledTimes(4);
    });
});
