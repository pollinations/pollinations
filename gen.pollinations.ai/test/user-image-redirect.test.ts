import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUserImage, UserImageError } from "../src/userImage.ts";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("fetchUserImage redirect policy", () => {
    it("refuses redirects by default, including when redirect is omitted", async () => {
        const fetchMock = vi.fn(async () => {
            return new Response(null, {
                status: 302,
                headers: { Location: "http://127.0.0.1/secret" },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            fetchUserImage("https://cdn.example.com/img.png"),
        ).rejects.toSatisfy((err: unknown) => {
            return (
                err instanceof UserImageError &&
                /redirects/i.test(err.message)
            );
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
        expect(init.redirect).toBe("manual");
    });

    it("still allows a caller to opt into following redirects", async () => {
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const fetchMock = vi.fn(async () => {
            return new Response(bytes, {
                status: 200,
                headers: { "Content-Type": "image/png" },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await fetchUserImage("https://cdn.example.com/img.png", {
            redirect: "follow",
        });
        expect(result.mimeType).toBe("image/png");
        const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
        expect(init.redirect).toBe("follow");
    });
});
