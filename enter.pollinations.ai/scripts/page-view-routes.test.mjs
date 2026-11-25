import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { productPageViewSchema } from "../../shared/product-analytics.ts";

// Enter's beacon takes the real URL path and drops any view the page enum does
// not name — silently, with no error and no 400
// (frontend/src/components/analytics.tsx). The enum is hand-maintained, so this
// walks the route files instead of repeating it: a page the router renders must
// be a page the beacon records.
const ROUTES_DIR = new URL("../frontend/src/routes/", import.meta.url);

function routablePages() {
    return readdirSync(ROUTES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
        .flatMap((entry) => {
            const source = readFileSync(
                new URL(entry.name, ROUTES_DIR),
                "utf8",
            );
            // A route without a component only redirects, so it shows no page.
            if (!/\bcomponent:/.test(source)) return [];
            const id = /createFileRoute\("([^"]+)"\)/.exec(source)?.[1];
            if (!id) return [];
            // A leading underscore is a pathless layout and adds no segment.
            const page = id
                .split("/")
                .filter((segment) => !segment.startsWith("_"))
                .join("/");
            return page === "" ? [] : [page];
        });
}

test("every routable dashboard page is one the beacon records", () => {
    const pages = routablePages();
    // Anchors, so a walk that finds nothing cannot pass by accident.
    assert.ok(pages.includes("/top-up"), "the walk must read the route files");
    assert.ok(pages.includes("/grant"), "the walk must read the route files");
    assert.ok(
        pages.length > 15,
        `expected the full route set, got ${pages.length}`,
    );
    for (const page of pages)
        assert.ok(
            productPageViewSchema.safeParse({ page }).success,
            `${page} renders a page the beacon drops`,
        );
});
