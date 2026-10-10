import { describe, expect, test, vi } from "vitest";
import worker from "./worker";

describe("hostname redirects", () => {
    test.each([
        ["GET", "https://old.pollinations.ai/", "https://pollinations.ai/"],
        [
            "HEAD",
            "https://old.pollinations.ai/docs?source=old-link",
            "https://pollinations.ai/",
        ],
        [
            "GET",
            "https://www.pollinations.ai/apps?category=image",
            "https://pollinations.ai/apps?category=image",
        ],
    ])("redirects %s %s before route handling", async (method, url, target) => {
        const fetchAsset = vi.fn();
        const response = await worker.fetch(new Request(url, { method }), {
            ASSETS: { fetch: fetchAsset },
        });

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(target);
        expect(await response.text()).toBe("");
        expect(fetchAsset).not.toHaveBeenCalled();
    });
});

describe("legacy image links", () => {
    test.each([
        [
            "GET",
            "/p/a%20red%20apple?width=512&seed=3",
            "https://image.pollinations.ai/prompt/a%20red%20apple?width=512&seed=3",
        ],
        ["HEAD", "/prompt/cat", "https://image.pollinations.ai/prompt/cat"],
    ])("redirects %s %s to the image API", async (method, path, target) => {
        const fetchAsset = vi.fn();
        const response = await worker.fetch(
            new Request(`https://pollinations.ai${path}`, { method }),
            { ASSETS: { fetch: fetchAsset } },
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(target);
        expect(fetchAsset).not.toHaveBeenCalled();
    });

    test.each([
        ["/p"],
        ["/p/"],
        ["/play"],
        ["/prompts/cat"],
    ])("leaves %s to the site", async (path) => {
        const fetchAsset = vi.fn(
            async () =>
                new Response("", {
                    headers: { "content-type": "image/png" },
                }),
        );
        await worker.fetch(new Request(`https://pollinations.ai${path}`), {
            ASSETS: { fetch: fetchAsset },
        });

        expect(fetchAsset).toHaveBeenCalled();
    });
});

describe("documentation entry redirect", () => {
    test.each([
        ["GET", "/docs"],
        ["GET", "/docs/"],
        ["GET", "/docs?source=old-link"],
        ["HEAD", "/docs"],
        ["HEAD", "/docs/"],
    ])("redirects %s %s without fetching assets", async (method, path) => {
        const fetchAsset = vi.fn();
        const response = await worker.fetch(
            new Request(`https://pollinations.ai${path}`, { method }),
            { ASSETS: { fetch: fetchAsset } },
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(
            "https://gen.pollinations.ai/docs",
        );
        expect(await response.text()).toBe("");
        expect(fetchAsset).not.toHaveBeenCalled();
    });

    test.each([
        ["GET", "/missing"],
        ["GET", "/docs/missing"],
        ["GET", "/docs-other"],
        ["POST", "/docs"],
    ])("leaves %s %s to normal asset handling", async (method, path) => {
        const assetResponse = new Response("Not found", { status: 404 });
        const fetchAsset = vi.fn().mockResolvedValue(assetResponse);
        const request = new Request(`https://pollinations.ai${path}`, {
            method,
        });
        const response = await worker.fetch(request, {
            ASSETS: { fetch: fetchAsset },
        });

        expect(fetchAsset).toHaveBeenCalledWith(request);
        expect(response).toBe(assetResponse);
        expect(response.headers.has("Location")).toBe(false);
    });
});
