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
            "https://old.pollinations.ai/api/github-stars",
            "https://pollinations.ai/",
        ],
        [
            "GET",
            "https://www.pollinations.ai/apps?category=image",
            "https://pollinations.ai/apps?category=image",
        ],
    ])("redirects %s %s before route handling", async (method, url, target) => {
        const fetchAsset = vi.fn();
        const waitUntil = vi.fn();
        const response = await worker.fetch(
            new Request(url, { method }),
            { ASSETS: { fetch: fetchAsset } },
            { waitUntil },
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(target);
        expect(await response.text()).toBe("");
        expect(fetchAsset).not.toHaveBeenCalled();
        expect(waitUntil).not.toHaveBeenCalled();
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
        const waitUntil = vi.fn();
        const response = await worker.fetch(
            new Request(`https://pollinations.ai${path}`, { method }),
            { ASSETS: { fetch: fetchAsset } },
            { waitUntil },
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(
            "https://gen.pollinations.ai/docs",
        );
        expect(await response.text()).toBe("");
        expect(fetchAsset).not.toHaveBeenCalled();
        expect(waitUntil).not.toHaveBeenCalled();
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
        const response = await worker.fetch(
            request,
            { ASSETS: { fetch: fetchAsset } },
            { waitUntil: vi.fn() },
        );

        expect(fetchAsset).toHaveBeenCalledWith(request);
        expect(response).toBe(assetResponse);
        expect(response.headers.has("Location")).toBe(false);
    });
});
