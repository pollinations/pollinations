import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { expect, test } from "vitest";
import html from "../frontend/index.html?raw";
import { pageMeta } from "../frontend/src/page-meta.ts";
import { rewriteFrontendHtml } from "../src/frontend.ts";
import worker from "../src/index.ts";

test.each(["/news", "/models", "/quests", "/grant", "/edit-key", "/top-up"])(
    "%s has its own metadata before JavaScript runs",
    async (path) => {
        const meta = pageMeta(path);
        if (!meta) throw new Error(`Missing page metadata: ${path}`);
        const response = rewriteFrontendHtml(
            new Response(html, {
                headers: { "Content-Type": "text/html" },
            }),
            meta,
        );
        const tags: Record<string, string[]> = {};
        const rewriter = new HTMLRewriter();
        for (const [selector, attribute] of [
            ['link[rel="canonical"]', "href"],
            ['meta[property="og:url"]', "content"],
            ['meta[property="og:title"]', "content"],
            ['meta[name="twitter:title"]', "content"],
            ['meta[name="description"]', "content"],
            ['meta[property="og:description"]', "content"],
            ['meta[name="twitter:description"]', "content"],
        ]) {
            tags[selector] = [];
            rewriter.on(selector, {
                element: (el) => {
                    tags[selector].push(el.getAttribute(attribute) ?? "");
                },
            });
        }
        const body = await rewriter.transform(response).text();
        const canonical = `https://enter.pollinations.ai${path}`;
        expect(tags['link[rel="canonical"]']).toEqual([canonical]);
        expect(tags['meta[property="og:url"]']).toEqual([canonical]);
        expect(tags['meta[property="og:title"]']).toEqual([meta.title]);
        expect(tags['meta[name="twitter:title"]']).toEqual([meta.title]);
        for (const selector of [
            'meta[name="description"]',
            'meta[property="og:description"]',
            'meta[name="twitter:description"]',
        ])
            expect(tags[selector]).toEqual([meta.description]);
        expect(body.match(/<title>(.*?)<\/title>/)?.[1]).toBe(
            meta.title.replaceAll("&", "&amp;"),
        );
        expect(body).toContain('<div id="root"></div>');
    },
);

test("page matching follows the router's case and trailing slash rules", () => {
    expect(pageMeta("/Models/")).toEqual(pageMeta("/models"));
    expect(pageMeta("/app/sign-in")).toBeDefined();
    for (const path of [
        "/missing",
        "/models/missing",
        "/constructor",
        "/assets/missing.js",
    ])
        expect(pageMeta(path)).toBeUndefined();
});

// Model asset-first routing: only the root document exists on disk.
const assets = {
    async fetch(request: Request) {
        if (new URL(request.url).pathname !== "/")
            return new Response(null, { status: 404 });
        if (request.headers.has("If-None-Match"))
            return new Response(null, { status: 304 });
        return new Response(request.method === "HEAD" ? null : html, {
            headers: { "Content-Type": "text/html" },
        });
    },
} as Fetcher;

async function fetchWorker(path: string, init?: RequestInit, binding = assets) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://enter.pollinations.ai${path}`, init),
        { ...env, ASSETS: binding },
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

test("known pages receive the rewritten shell through the Worker entrypoint", async () => {
    const response = await fetchWorker("/models");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
        "<title>Models | pollinations.ai</title>",
    );
});

test("unknown pages return a 404 shell without canonical tags, even with cache validators", async () => {
    const response = await fetchWorker("/missing", {
        headers: { "If-None-Match": '"cached-homepage"' },
    });
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain('<div id="root"></div>');
    expect(body).toContain("<title>Page not found | pollinations.ai</title>");
    expect(body).not.toContain('rel="canonical"');
    expect(body).not.toContain('property="og:url"');
});

test("known pages preserve conditional requests", async () => {
    const response = await fetchWorker("/models", {
        headers: { "If-None-Match": '"cached-homepage"' },
    });
    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
});

test.each([
    ["/models", 200],
    ["/missing", 404],
] as const)("HEAD %s keeps its status without a body", async (path, status) => {
    const response = await fetchWorker(path, { method: "HEAD" });
    expect(response.status).toBe(status);
    expect(await response.text()).toBe("");
});

test.each(["/privacy", "/terms", "/refunds", "/Privacy/"])(
    "%s redirects to the main site's legal page",
    async (path) => {
        const response = await fetchWorker(path);
        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(
            `https://pollinations.ai${path.toLowerCase().replace(/\/$/, "")}`,
        );
    },
);

test.each([
    ["/api/docs", 301, "https://gen.pollinations.ai/docs"],
    [
        "/.well-known/api-catalog",
        308,
        "https://gen.pollinations.ai/.well-known/api-catalog",
    ],
] as const)("%s still reaches the API app", async (path, status, location) => {
    const response = await fetchWorker(path, undefined, {
        fetch() {
            throw new Error("API request reached ASSETS");
        },
    } as unknown as Fetcher);
    expect(response.status).toBe(status);
    expect(response.headers.get("Location")).toBe(location);
});

test.each(["/robots.txt", "/models"])(
    "non-HTML responses at %s pass through unchanged",
    async (path) => {
        const original = new Response("asset data", {
            headers: { "Content-Type": "text/plain", ETag: '"asset"' },
        });
        const response = await fetchWorker(path, undefined, {
            async fetch() {
                return original;
            },
        } as unknown as Fetcher);
        expect(response).toBe(original);
        expect(await response.text()).toBe("asset data");
    },
);
