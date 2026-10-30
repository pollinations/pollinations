import { expect, test } from "vitest";
import html from "../frontend/index.html?raw";
import {
    NOT_FOUND_META,
    pageHtml,
    pageMeta,
} from "../frontend/src/page-meta.ts";

async function readTags(page: string) {
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
                // HTMLRewriter returns attribute values undecoded.
                tags[selector].push(
                    (el.getAttribute(attribute) ?? "").replaceAll("&amp;", "&"),
                );
            },
        });
    }
    const body = await rewriter
        .transform(
            new Response(page, { headers: { "Content-Type": "text/html" } }),
        )
        .text();
    return { tags, body };
}

test.each(["/news", "/models", "/quests", "/grant", "/edit-key", "/top-up"])(
    "%s has its own metadata before JavaScript runs",
    async (path) => {
        const meta = pageMeta(path);
        if (!meta) throw new Error(`Missing page metadata: ${path}`);
        const { tags, body } = await readTags(pageHtml(html, meta));
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

test("the 404 page has its own title and no canonical URL", async () => {
    const { tags, body } = await readTags(pageHtml(html, NOT_FOUND_META));
    expect(body).toContain("<title>Page not found | pollinations.ai</title>");
    expect(tags['link[rel="canonical"]']).toEqual([]);
    expect(tags['meta[property="og:url"]']).toEqual([]);
    expect(tags['meta[name="description"]']).toEqual([
        NOT_FOUND_META.description,
    ]);
    expect(body).toContain('<div id="root"></div>');
});

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
