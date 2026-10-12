import { describe, expect, test } from "vitest";
import { websitePageViewSchema } from "../../shared/product-analytics";
import {
    getJsonLd,
    knownPage,
    NOT_FOUND_META,
    ROUTE_META,
    routeHead,
} from "./routeMeta";

describe("route metadata", () => {
    test.each(
        Object.keys(ROUTE_META),
    )("owns all changing tags for %s", (path) => {
        const head = routeHead(path);
        const meta = ROUTE_META[path];
        const canonical = `https://pollinations.ai${path === "/" ? "" : path}`;
        expect(head.meta).toEqual([
            { title: meta.title },
            { name: "description", content: meta.description },
            { property: "og:title", content: meta.title },
            { property: "og:description", content: meta.description },
            { name: "twitter:title", content: meta.title },
            { name: "twitter:description", content: meta.description },
            { property: "og:url", content: canonical },
        ]);
        expect(head.links).toEqual([{ rel: "canonical", href: canonical }]);
    });

    test("unknown pages have no canonical URL or stale structured data", () => {
        for (const path of [undefined, "/missing"]) {
            const head = routeHead(path);
            expect(head.meta[0]).toEqual({ title: NOT_FOUND_META.title });
            expect(head.links).toEqual([]);
            expect(head.scripts).toEqual([]);
            expect(
                head.meta.some(
                    (tag) => "property" in tag && tag.property === "og:url",
                ),
            ).toBe(false);
        }
    });

    test("server and client share structured data only on relevant pages", () => {
        for (const path of ["/", "/play"]) {
            expect(routeHead(path).scripts).toEqual([
                { type: "application/ld+json", children: getJsonLd(path) },
            ]);
        }
        expect(routeHead("/apps").scripts).toEqual([]);
    });

    test("page views name the page shown, never the raw path", () => {
        expect(knownPage("/")).toBe("/");
        expect(knownPage("/Play")).toBe("/play");
        expect(knownPage("/apps/")).toBe("/apps");
        for (const path of ["/apps/x", "/zz", "/a%20cat%20prompt"])
            expect(knownPage(path)).toBeUndefined();
    });

    test("Enter accepts a page view for every known page", () => {
        expect(Object.keys(ROUTE_META).sort()).toEqual(
            [...websitePageViewSchema.shape.page.options].sort(),
        );
    });
});
