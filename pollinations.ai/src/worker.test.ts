import { describe, expect, test, vi } from "vitest";
import worker from "./worker";

// HTMLRewriter is a Cloudflare runtime global that plain vitest doesn't ship.
// The suites below only assert on response headers and redirects, so a
// pass-through is all the SEO path needs.
Object.assign(globalThis, {
    HTMLRewriter: class {
        on() {
            return this;
        }
        transform(response: Response) {
            return response;
        }
    },
});

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
            "https://playground.pollinations.ai/",
            "https://pollinations.ai/play",
        ],
        [
            "HEAD",
            "https://playground.pollinations.ai/index.html?model=flux",
            "https://pollinations.ai/play",
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

    test.each([["/p"], ["/p/"], ["/play"], ["/prompts/cat"]])(
        "leaves %s to the site",
        async (path) => {
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
        },
    );
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

describe("agent discovery", () => {
    const htmlAsset = () =>
        new Response(
            "<!doctype html><html><head><title></title></head></html>",
            { headers: { "content-type": "text/html; charset=utf-8" } },
        );

    test("adds links when the asset response has immutable headers", async () => {
        const asset = await fetch("data:text/html,%3Chtml%3Eok%3C%2Fhtml%3E");
        expect(() => asset.headers.set("Link", "test")).toThrow();

        const response = await worker.fetch(
            new Request("https://pollinations.ai/"),
            { ASSETS: { fetch: async () => asset } },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("Link")).toContain("service-desc");
    });

    test.each(["/", "/apps", "/community", "/play"])(
        "advertises the machine-readable surface on %s",
        async (path) => {
            const response = await worker.fetch(
                new Request(`https://pollinations.ai${path}`),
                { ASSETS: { fetch: async () => htmlAsset() } },
            );

            const link = response.headers.get("Link") ?? "";
            expect(link).toContain(
                '<https://gen.pollinations.ai/openapi.json>; rel="service-desc"',
            );
            expect(link).toContain(
                '<https://gen.pollinations.ai/docs/llm.txt>; rel="service-doc"',
            );
            expect(link).toContain(
                '<https://gen.pollinations.ai/.well-known/api-catalog>; rel="api-catalog"',
            );
            expect(link).toContain(
                '<https://gen.pollinations.ai/.well-known/ai-catalog.json>; rel="describedby"',
            );
        },
    );

    test("keeps the header off assets and unknown routes", async () => {
        const png = new Response("", {
            headers: { "content-type": "image/png" },
        });
        const asset = await worker.fetch(
            new Request("https://pollinations.ai/art/star.png"),
            { ASSETS: { fetch: async () => png } },
        );
        expect(asset.headers.has("Link")).toBe(false);

        const missing = await worker.fetch(
            new Request("https://pollinations.ai/not-a-page"),
            { ASSETS: { fetch: async () => htmlAsset() } },
        );
        expect(missing.status).toBe(404);
        expect(missing.headers.has("Link")).toBe(false);
    });
});
