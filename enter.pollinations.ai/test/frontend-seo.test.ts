import { expect, test } from "vitest";
import html from "../frontend/index.html?raw";
import { pageMeta } from "../frontend/src/page-meta.ts";
import { rewriteFrontendHtml } from "../src/frontend.ts";

test.each(["/news", "/models", "/quests"])(
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
        expect(body).not.toContain(
            "<title>Dashboard | pollinations.ai</title>",
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
